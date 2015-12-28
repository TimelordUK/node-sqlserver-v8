//---------------------------------------------------------------------------------------------------------------------------------
// File: OdbcConnection.cpp
// Contents: Async calls to ODBC done in background thread
// 
// Copyright Microsoft Corporation and contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//
// You may obtain a copy of the License at:
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//---------------------------------------------------------------------------------------------------------------------------------

#include "stdafx.h"
#include "OdbcConnection.h"
#include "NodeColumns.h"


#pragma intrinsic( memset )

// convenient macro to set the error for the handle and return false
#define RETURN_ODBC_ERROR( handle )                         \
	           {                                                       \
        error = handle.LastError(); \
        handle.Free();                                      \
        return false;                                       \
	           }

// boilerplate macro for checking for ODBC errors in this file
#define CHECK_ODBC_ERROR( r, handle ) { if( !SQL_SUCCEEDED( r ) ) { RETURN_ODBC_ERROR( handle ); } }

// boilerplate macro for checking if SQL_NO_DATA was returned for field data
#define CHECK_ODBC_NO_DATA( r, handle ) {                                                                 \
    if( r == SQL_NO_DATA ) {                                                                              \
        error = make_shared<OdbcError>( OdbcError::NODE_SQL_NO_DATA.SqlState(), OdbcError::NODE_SQL_NO_DATA.Message(), \
            OdbcError::NODE_SQL_NO_DATA.Code() );                                                         \
        handle.Free();                                                                                    \
        return false;                                                                                     \
             } }

// to use with numeric_limits below
#undef max

namespace mssql
{
	// internal constants
	namespace {

		// max characters within a (var)char field in SQL Server
		const int SQL_SERVER_MAX_STRING_SIZE = 8000;

		// default size to retrieve from a LOB field and we don't know the size
		const int LOB_PACKET_SIZE = 8192;
	}

	OdbcEnvironmentHandle OdbcConnection::environment;

	size_t getSize(BoundDatumSet& params)
	{
		auto f = params.begin();
		size_t size = f != params.end() ? f->getIndVec().size() : 0;
		return size;
	}

	// bind all the parameters in the array
	bool OdbcConnection::BindParams(BoundDatumSet& params)
	{
		size_t size = getSize(params);
		if (size <= 0) return true;
		SQLSetStmtAttr(statement, SQL_ATTR_PARAMSET_SIZE, reinterpret_cast<SQLPOINTER>(size), 0);
		int current_param = 1;
		for (auto itr = params.begin(); itr != params.end(); ++itr) {
			auto & datum = *itr;
			SQLRETURN r = SQLBindParameter(statement, current_param++, datum.param_type, datum.c_type, datum.sql_type, datum.param_size, datum.digits, datum.buffer, datum.buffer_len, datum.getIndVec().data());
			CHECK_ODBC_ERROR(r, statement);
		}

		return true;
	}

	bool OdbcConnection::InitializeEnvironment()
	{
		SQLRETURN ret = SQLSetEnvAttr(nullptr, SQL_ATTR_CONNECTION_POOLING, reinterpret_cast<SQLPOINTER>(SQL_CP_ONE_PER_HENV), 0);
		if (!SQL_SUCCEEDED(ret)) { return false; }

		if (!environment.Alloc()) { return false; }

		ret = SQLSetEnvAttr(environment, SQL_ATTR_ODBC_VERSION, reinterpret_cast<SQLPOINTER>(SQL_OV_ODBC3), 0);
		if (!SQL_SUCCEEDED(ret)) { return false; }
		ret = SQLSetEnvAttr(environment, SQL_ATTR_CP_MATCH, reinterpret_cast<SQLPOINTER>(SQL_CP_RELAXED_MATCH), 0);
		if (!SQL_SUCCEEDED(ret)) { return false; }

		return true;
	}

	bool OdbcConnection::readNext(int column)
	{
		SQLSMALLINT nameLength;
		SQLRETURN ret;

		ret = SQLDescribeCol(statement, column + 1, nullptr, 0, &nameLength, nullptr, nullptr, nullptr, nullptr);
		CHECK_ODBC_ERROR(ret, statement);

		ResultSet::ColumnDefinition& current = resultset->GetMetadata(column);
		vector<wchar_t> buffer(nameLength + 1);
		ret = SQLDescribeCol(statement, column + 1, buffer.data(), nameLength + 1, &nameLength, &current.dataType, &current.columnSize, &current.decimalDigits, &current.nullable);
		CHECK_ODBC_ERROR(ret, statement);
		current.name = wstring(buffer.data(), nameLength);

		wchar_t typeName[1024];
		SQLSMALLINT typeNameLen;
		ret = SQLColAttribute(statement, column + 1, SQL_DESC_TYPE_NAME, typeName, 1024 * sizeof(wchar_t),
			&typeNameLen, nullptr);
		CHECK_ODBC_ERROR(ret, statement);
		current.dataTypeName = wstring(typeName, typeNameLen);

		if (current.dataType == SQL_SS_VARIANT) {
			SQLLEN variantType;
			ret = SQLColAttribute(statement, column + 1, SQL_CA_SS_VARIANT_TYPE, nullptr, NULL, nullptr, &variantType);
			CHECK_ODBC_ERROR(ret, statement);
			current.dataType = static_cast<SQLSMALLINT>(variantType);
		}

		else if (current.dataType == SQL_SS_UDT) {
			wchar_t udtTypeName[1024];
			SQLSMALLINT udtTypeNameLen;
			ret = SQLColAttribute(statement, column + 1, SQL_CA_SS_UDT_TYPE_NAME, udtTypeName, 1024 * sizeof(wchar_t), &udtTypeNameLen, nullptr);
			CHECK_ODBC_ERROR(ret, statement);
			current.udtTypeName = wstring(udtTypeName, udtTypeNameLen);
		}
		return true;
	}

	bool OdbcConnection::StartReadingResults()
	{
		SQLSMALLINT columns;
		SQLRETURN ret = SQLNumResultCols(statement, &columns);
		CHECK_ODBC_ERROR(ret, statement);

		int column = 0;
		resultset = make_shared<ResultSet>(columns);

		while (column < resultset->GetColumns())
		{
			if (!readNext(column++)) {
				return false;
			}
		}

		ret = SQLRowCount(statement, &resultset->rowcount);
		CHECK_ODBC_ERROR(ret, statement);

		return true;
	}

	bool OdbcConnection::TryClose()
	{
		if (connectionState != Closed)  // fast fail before critical section
		{
			ScopedCriticalSectionLock critSecLock(closeCriticalSection);
			if (connectionState != Closed)
			{
				SQLDisconnect(connection);

				resultset.reset();
				statement.Free();
				connection.Free();
				connectionState = Closed;
			}
		}

		return true;
	}

	bool OdbcConnection::TryOpen(const wstring& connectionString, int timeout)
	{
		SQLRETURN ret;

		assert(connectionState == Closed);

		OdbcConnectionHandle localConnection;

		if (!localConnection.Alloc(environment)) { RETURN_ODBC_ERROR(environment); }
		this->connection = move(localConnection);

		if (timeout > 0)
		{
			ret = SQLSetConnectAttr(connection, SQL_ATTR_CONNECTION_TIMEOUT, reinterpret_cast<SQLPOINTER>(timeout), 0);
			CHECK_ODBC_ERROR(ret, connection);

			ret = SQLSetConnectAttr(connection, SQL_ATTR_LOGIN_TIMEOUT, reinterpret_cast<SQLPOINTER>(timeout), 0);
			CHECK_ODBC_ERROR(ret, connection);
		}

		ret = SQLDriverConnect(connection, nullptr, const_cast<wchar_t*>(connectionString.c_str()), static_cast<SQLSMALLINT>(connectionString.length()), nullptr, 0, nullptr, SQL_DRIVER_NOPROMPT);
		CHECK_ODBC_ERROR(ret, connection);

		connectionState = Open;
		return true;
	}

	bool OdbcConnection::TryExecute(const wstring& query, u_int timeout, BoundDatumSet& paramIt)
	{
		assert(connectionState == Open);

		// if the statement isn't already allocated
		if (!statement)
		{
			// allocate it
			if (!statement.Alloc(connection)) { RETURN_ODBC_ERROR(connection); }
		}

		bool bound = BindParams(paramIt);
		if (!bound) {
			// error already set in BindParams
			return false;
		}

		endOfResults = true;     // reset 
		SQLRETURN ret;

		if (timeout > 0) {
			ret = SQLSetStmtAttr(statement, SQL_QUERY_TIMEOUT, reinterpret_cast<SQLPOINTER>(timeout), SQL_IS_UINTEGER);
			CHECK_ODBC_ERROR(ret, connection);
			SQLSetStmtAttr(statement, SQL_ATTR_QUERY_TIMEOUT, reinterpret_cast<SQLPOINTER>(timeout), SQL_IS_UINTEGER);
			CHECK_ODBC_ERROR(ret, connection);
		}

		ret = SQLExecDirect(statement, const_cast<wchar_t*>(query.c_str()), SQL_NTS);
		if (ret != SQL_NO_DATA && !SQL_SUCCEEDED(ret))
		{
			resultset = make_shared<ResultSet>(0);
			resultset->endOfRows = true;
			RETURN_ODBC_ERROR(statement);
		}

		return StartReadingResults();
	}

	bool OdbcConnection::TryReadRow()
	{
		//column = 0; // reset

		SQLRETURN ret = SQLFetch(statement);
		if (ret == SQL_NO_DATA)
		{
			resultset->endOfRows = true;
			return true;
		}
		resultset->endOfRows = false;
		CHECK_ODBC_ERROR(ret, statement);

		return true;
	}

	void OdbcConnection::init()
	{
		dispatchers.insert(getPair(SQL_CHAR, &OdbcConnection::d_String));
		dispatchers.insert(getPair(SQL_VARCHAR, &OdbcConnection::d_String));
		dispatchers.insert(getPair(SQL_LONGVARCHAR, &OdbcConnection::d_String));
		dispatchers.insert(getPair(SQL_WCHAR, &OdbcConnection::d_String));
		dispatchers.insert(getPair(SQL_WVARCHAR, &OdbcConnection::d_String));
		dispatchers.insert(getPair(SQL_WLONGVARCHAR, &OdbcConnection::d_String));
		dispatchers.insert(getPair(SQL_SS_XML, &OdbcConnection::d_String));
		dispatchers.insert(getPair(SQL_GUID, &OdbcConnection::d_String));

		dispatchers.insert(getPair(SQL_BIT, &OdbcConnection::d_Bit));

		dispatchers.insert(getPair(SQL_SMALLINT, &OdbcConnection::d_Integer));
		dispatchers.insert(getPair(SQL_TINYINT, &OdbcConnection::d_Integer));
		dispatchers.insert(getPair(SQL_INTEGER, &OdbcConnection::d_Integer));

		dispatchers.insert(getPair(SQL_DECIMAL, &OdbcConnection::d_Decimal));
		dispatchers.insert(getPair(SQL_NUMERIC, &OdbcConnection::d_Decimal));
		dispatchers.insert(getPair(SQL_REAL, &OdbcConnection::d_Decimal));
		dispatchers.insert(getPair(SQL_FLOAT, &OdbcConnection::d_Decimal));
		dispatchers.insert(getPair(SQL_DOUBLE, &OdbcConnection::d_Decimal));
		dispatchers.insert(getPair(SQL_BIGINT, &OdbcConnection::d_Decimal));

		dispatchers.insert(getPair(SQL_BINARY, &OdbcConnection::d_Binary));
		dispatchers.insert(getPair(SQL_VARBINARY, &OdbcConnection::d_Binary));
		dispatchers.insert(getPair(SQL_LONGVARBINARY, &OdbcConnection::d_Binary));
		dispatchers.insert(getPair(SQL_SS_UDT, &OdbcConnection::d_Binary));

		dispatchers.insert(getPair(SQL_TYPE_TIMESTAMP, &OdbcConnection::d_Timestamp));
		dispatchers.insert(getPair(SQL_TYPE_DATE, &OdbcConnection::d_Timestamp));
		dispatchers.insert(getPair(SQL_SS_TIMESTAMPOFFSET, &OdbcConnection::d_Timestamp));

		dispatchers.insert(getPair(SQL_TYPE_TIME, &OdbcConnection::d_Time));
		dispatchers.insert(getPair(SQL_SS_TIME2, &OdbcConnection::d_Time));
	}

	bool OdbcConnection::d_Time(int column)
	{
		SQLLEN strLen_or_IndPtr;
		SQL_SS_TIME2_STRUCT time;
		memset(&time, 0, sizeof(time));

		SQLRETURN ret = SQLGetData(statement, column + 1, SQL_C_DEFAULT, &time, sizeof(time),
			&strLen_or_IndPtr);
		CHECK_ODBC_ERROR(ret, statement);
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}

		SQL_SS_TIMESTAMPOFFSET_STRUCT datetime;
		memset(&datetime, 0, sizeof(datetime));  // not necessary, but simple precaution
		datetime.year = SQL_SERVER_DEFAULT_YEAR;
		datetime.month = SQL_SERVER_DEFAULT_MONTH;
		datetime.day = SQL_SERVER_DEFAULT_DAY;
		datetime.hour = time.hour;
		datetime.minute = time.minute;
		datetime.second = time.second;
		datetime.fraction = time.fraction;

		resultset->SetColumn(make_shared<TimestampColumn>(datetime));
		return true;
	}

	bool OdbcConnection::d_Timestamp(int column)
	{
		SQLLEN strLen_or_IndPtr;
		SQL_SS_TIMESTAMPOFFSET_STRUCT datetime;
		memset(&datetime, 0, sizeof(datetime));

		SQLRETURN ret = SQLGetData(statement, column + 1, SQL_C_DEFAULT, &datetime, sizeof(datetime),
			&strLen_or_IndPtr);
		CHECK_ODBC_ERROR(ret, statement);
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true; // break
		}

		resultset->SetColumn(make_shared<TimestampColumn>(datetime));

		return true;
	}

	bool OdbcConnection::d_Integer(int column)
	{
		long val;
		SQLLEN strLen_or_IndPtr;
		SQLRETURN ret = SQLGetData(statement, column + 1, SQL_C_SLONG, &val, sizeof(val), &strLen_or_IndPtr);
		CHECK_ODBC_ERROR(ret, statement);
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
		}
		else
		{
			resultset->SetColumn(make_shared<IntColumn>(val));
		}
		return true;
	}

	bool OdbcConnection::d_String(int column)
	{
		bool read = TryReadString(false, column);
		return read;
	}

	bool OdbcConnection::d_Bit(int column)
	{
		long val;
		SQLLEN strLen_or_IndPtr;
		SQLRETURN ret = SQLGetData(statement, column + 1, SQL_C_SLONG, &val, sizeof(val), &strLen_or_IndPtr);
		CHECK_ODBC_ERROR(ret, statement);
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
		}
		else
		{
			resultset->SetColumn(make_shared<BoolColumn>((val != 0) ? true : false));
		}
		return true;
	}

	bool OdbcConnection::d_Decimal(int column)
	{
		SQLLEN strLen_or_IndPtr;
		double val;
		SQLRETURN ret = SQLGetData(statement, column + 1, SQL_C_DOUBLE, &val, sizeof(val), &strLen_or_IndPtr);
		CHECK_ODBC_ERROR(ret, statement);
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
		}
		else
		{
			resultset->SetColumn(make_shared<NumberColumn>(val));
		}
		return true;
	}

	bool OdbcConnection::d_Binary(int column)
	{
		SQLLEN strLen_or_IndPtr;
		bool more = false;
		vector<char> buffer(2048);
		SQLRETURN ret = SQLGetData(statement, column + 1, SQL_C_BINARY, buffer.data(), buffer.size(), &strLen_or_IndPtr);
		CHECK_ODBC_ERROR(ret, statement);
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
		}
		else
		{
			assert(strLen_or_IndPtr != SQL_NO_TOTAL); // per http://msdn.microsoft.com/en-us/library/windows/desktop/ms715441(v=vs.85).aspx

			SQLWCHAR SQLState[6];
			SQLINTEGER nativeError;
			SQLSMALLINT textLength;
			if (ret == SQL_SUCCESS_WITH_INFO)
			{
				ret = SQLGetDiagRec(SQL_HANDLE_STMT, statement, 1, SQLState, &nativeError, nullptr, 0, &textLength);
				CHECK_ODBC_ERROR(ret, statement);
				more = wcsncmp(SQLState, L"01004", 6) == 0;
			}

			auto amount = strLen_or_IndPtr;
			if (more) {
				amount = buffer.size();
			}

			vector<char> trimmed(amount);
			memcpy(trimmed.data(), buffer.data(), amount);
			resultset->SetColumn(make_shared<BinaryColumn>(trimmed, more));
		}
		return true;
	}


	bool OdbcConnection::TryReadColumn(int column)
	{
		assert(column >= 0 && column < resultset->GetColumns());
		auto definition = resultset->GetMetadata(column);
		auto r = dispatchers.find(definition.dataType);
		if (r != dispatchers.end())
		{
			return (this->*r->second)(column);
		}
		assert(false);
		return false;
	}

	bool OdbcConnection::Lob(SQLLEN display_size, int column)
	{
		SQLLEN value_len;
		bool more;
		SQLRETURN r;

		value_len = LOB_PACKET_SIZE + 1;
		auto value = make_unique<StringColumn::StringValue>(value_len);

		r = SQLGetData(statement, column + 1, SQL_C_WCHAR, value->data(), value_len * sizeof(StringColumn::StringValue::value_type), &value_len);

		CHECK_ODBC_NO_DATA(r, statement);
		CHECK_ODBC_ERROR(r, statement);

		if (value_len == SQL_NULL_DATA) {
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}

		// an unknown amount is left on the field so no total was returned
		if (value_len == SQL_NO_TOTAL || value_len / sizeof(StringColumn::StringValue::value_type) > LOB_PACKET_SIZE) {
			more = true;
			value->resize(LOB_PACKET_SIZE);
		}
		else {
			// value_len is in bytes
			value->resize(value_len / sizeof(StringColumn::StringValue::value_type));
			more = false;
		}

		resultset->SetColumn(make_shared<StringColumn>(value, more));
		return true;
	}

	bool OdbcConnection::boundedString(SQLLEN display_size, int column)
	{
		unique_ptr<StringColumn::StringValue> value(new StringColumn::StringValue());
		SQLLEN value_len = 0;
		SQLRETURN r;

		display_size++;                 // increment for null terminator
		value->resize(display_size);

		r = SQLGetData(statement, column + 1, SQL_C_WCHAR, value->data(), display_size *
			sizeof(StringColumn::StringValue::value_type), &value_len);
		CHECK_ODBC_ERROR(r, statement);
		CHECK_ODBC_NO_DATA(r, statement);

		if (value_len == SQL_NULL_DATA) {
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}

		assert(value_len % 2 == 0);   // should always be even
		value_len /= sizeof(StringColumn::StringValue::value_type);

		assert(value_len >= 0 && value_len <= display_size - 1);
		value->resize(value_len);

		resultset->SetColumn(make_shared<StringColumn>(value, false));

		return true;
	}

	bool OdbcConnection::TryReadString(bool binary, int column)
	{
		SQLLEN display_size = 0;

		SQLRETURN r = SQLColAttribute(statement, column + 1, SQL_DESC_DISPLAY_SIZE, nullptr, 0, nullptr, &display_size);
		CHECK_ODBC_ERROR(r, statement);

		// when a field type is LOB, we read a packet at time and pass that back.
		if (display_size == 0 || display_size == numeric_limits<int>::max() ||
			display_size == numeric_limits<int>::max() >> 1 ||
			display_size == numeric_limits<unsigned long>::max() - 1) {
			return Lob(display_size, column);
		}

		if (display_size >= 1 && display_size <= SQL_SERVER_MAX_STRING_SIZE) {
			return boundedString(display_size, column);
		}

		assert(false);

		return false;
	}

	bool OdbcConnection::TryReadNextResult()
	{
		auto ret = SQLMoreResults(statement);
		if (ret == SQL_NO_DATA)
		{
			endOfResults = true;
			statement.Free();
			return true;
		}
		CHECK_ODBC_ERROR(ret, statement);

		endOfResults = false;

		return StartReadingResults();
	}

	bool OdbcConnection::TryBeginTran(void)
	{
		// turn off autocommit
		auto ret = SQLSetConnectAttr(connection, SQL_ATTR_AUTOCOMMIT, reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_OFF), SQL_IS_UINTEGER);
		CHECK_ODBC_ERROR(ret, connection);

		return true;
	}

	bool OdbcConnection::TryEndTran(SQLSMALLINT completionType)
	{
		auto ret = SQLEndTran(SQL_HANDLE_DBC, connection, completionType);
		CHECK_ODBC_ERROR(ret, connection);

		// put the connection back into auto commit mode
		ret = SQLSetConnectAttr(connection, SQL_ATTR_AUTOCOMMIT, reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_ON), SQL_IS_UINTEGER);
		CHECK_ODBC_ERROR(ret, connection);

		return true;
	}
}
