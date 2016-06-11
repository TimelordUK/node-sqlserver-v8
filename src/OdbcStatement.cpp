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
#include "OdbcStatement.h"
#include "BoundDatumSet.h"
#include "NodeColumns.h"
#include "OdbcHelper.h"

namespace mssql
{
	// internal constants

	size_t getSize(BoundDatumSet& params)
	{
		auto f = params.begin();
		size_t size = f != params.end() ? f->getIndVec().size() : 0;
		return size;
	}

	OdbcStatement::~OdbcStatement()
	{
		if (statement) {
			statement.Free();
		}
		if (resultset != nullptr) {
			resultset.reset();
		}
	}

	OdbcStatement::OdbcStatement(int statementId, OdbcConnectionHandle &c)
		:	
		connection(c),
		error(nullptr),
		endOfResults(true),
		statementId(statementId),
		prepared(false),
		resultset(nullptr)
	{
		if (!statement)
		{
			// allocate it
			if (!statement.Alloc(connection))
			{
				// todo: set error state.
			}
		}
	}

	void OdbcStatement::applyPrecision(const BoundDatum & datum, int current_param) const
	{
		/* Modify the fields in the implicit application parameter descriptor */
		SQLHDESC   hdesc = nullptr;

		SQLGetStmtAttr(statement, SQL_ATTR_APP_PARAM_DESC, &hdesc, 0, nullptr);
		SQLSetDescField(hdesc, current_param, SQL_DESC_TYPE, reinterpret_cast<SQLPOINTER>(datum.c_type), 0);
		SQLSetDescField(hdesc, current_param, SQL_DESC_PRECISION, reinterpret_cast<SQLPOINTER>(datum.param_size), 0);
		SQLSetDescField(hdesc, current_param, SQL_DESC_SCALE, reinterpret_cast<SQLPOINTER>(datum.digits), 0);
		SQLSetDescField(hdesc, current_param, SQL_DESC_DATA_PTR, static_cast<SQLPOINTER>(datum.buffer), 0);
	}

	// bind all the parameters in the array
	bool OdbcStatement::BindParams(BoundDatumSet& params)
	{
		size_t size = getSize(params);
		if (size <= 0) return true;
		SQLSetStmtAttr(statement, SQL_ATTR_PARAMSET_SIZE, reinterpret_cast<SQLPOINTER>(size), 0);
		int current_param = 1;
		for (auto itr = params.begin(); itr != params.end(); ++itr) {
			auto & datum = *itr;
			auto r = SQLBindParameter(statement, current_param, datum.param_type, datum.c_type, datum.sql_type, datum.param_size, datum.digits, datum.buffer, datum.buffer_len, datum.getIndVec().data());
			CHECK_ODBC_ERROR(r, statement);
			if (datum.getDefinedPrecision()) {
				applyPrecision(datum, current_param);
			}
			++current_param;
		}

		return true;
	}

	Handle<Value> OdbcStatement::GetMetaValue() const
	{
		return resultset->MetaToValue();
	}

	Handle<Value> OdbcStatement::EndOfResults() const
	{
		nodeTypeFactory fact;
		return fact.newBoolean(endOfResults);
	}

	Handle<Value> OdbcStatement::EndOfRows() const
	{
		nodeTypeFactory fact;
		return fact.newBoolean(resultset->EndOfRows());
	}

	Handle<Value> OdbcStatement::GetColumnValue() const
	{
		nodeTypeFactory fact;
		auto result = fact.newObject();
		auto column = resultset->GetColumn();
		result->Set(fact.fromTwoByte(L"data"), column->ToValue());
		result->Set(fact.fromTwoByte(L"more"), fact.newBoolean(column->More()));
		return result;
	}

	bool OdbcStatement::readColAttributes(ResultSet::ColumnDefinition& current, int column)
	{
		SQLRETURN ret;

		const size_t l = 1024;
		wchar_t typeName[l];
		SQLSMALLINT typeNameLen;
		auto index = column + 1;
		ret = SQLColAttribute(statement, index, SQL_DESC_TYPE_NAME, typeName, l * sizeof(wchar_t), &typeNameLen, nullptr);
		CHECK_ODBC_ERROR(ret, statement);
		current.dataTypeName = wstring(typeName, typeNameLen);

		switch (current.dataType)
		{
		case SQL_SS_VARIANT:
		{
			// dispatch as variant type which reads underlying column type and re-reads correctly.
		}
		break;

		case SQL_SS_UDT:
		{
			wchar_t udtTypeName[l];
			SQLSMALLINT udtTypeNameLen;
			ret = SQLColAttribute(statement, index, SQL_CA_SS_UDT_TYPE_NAME, udtTypeName, l * sizeof(wchar_t), &udtTypeNameLen, nullptr);
			CHECK_ODBC_ERROR(ret, statement);
			current.udtTypeName = wstring(udtTypeName, udtTypeNameLen);
		}
		break;

		default:
			break;
		}

		return true;
	}

	bool OdbcStatement::readNext(int column)
	{
		SQLSMALLINT nameLength;
		SQLRETURN ret;
		auto index = column + 1;
		ret = SQLDescribeCol(statement, index, nullptr, 0, &nameLength, nullptr, nullptr, nullptr, nullptr);
		CHECK_ODBC_ERROR(ret, statement);

		auto & current = resultset->GetMetadata(column);
		vector<wchar_t> buffer(nameLength + 1);
		ret = SQLDescribeCol(statement, index, buffer.data(), nameLength + 1, &nameLength, &current.dataType, &current.columnSize, &current.decimalDigits, &current.nullable);
		CHECK_ODBC_ERROR(ret, statement);
		current.name = wstring(buffer.data(), nameLength);

		ret = readColAttributes(current, column);
		CHECK_ODBC_ERROR(ret, statement);

		return ret;
	}

	bool OdbcStatement::StartReadingResults()
	{
		SQLSMALLINT columns;
		SQLRETURN ret = SQLNumResultCols(statement, &columns);
		CHECK_ODBC_ERROR(ret, statement);

		int column = 0;
		resultset = make_unique<ResultSet>(columns);

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

	SQLRETURN OdbcStatement::queryTimeout(int timeout)
	{
		SQLRETURN ret;
		if (timeout > 0) {
			SQLPOINTER to = reinterpret_cast<SQLPOINTER>(static_cast<UINT_PTR>(timeout));
			ret = SQLSetStmtAttr(statement, SQL_QUERY_TIMEOUT, to, SQL_IS_UINTEGER);
			CHECK_ODBC_ERROR(ret, connection);
			SQLSetStmtAttr(statement, SQL_ATTR_QUERY_TIMEOUT, to, SQL_IS_UINTEGER);
			CHECK_ODBC_ERROR(ret, connection);
		}
		return true;
	}

	bool OdbcStatement::TryPrepare(const wstring& query, u_int timeout, BoundDatumSet& params)
	{
		SQLRETURN ret;
		SQLWCHAR * sql_str = const_cast<wchar_t *>(query.c_str());
		SQLSMALLINT numCols;

		ret = SQLPrepare(statement, sql_str, static_cast<SQLINTEGER>(query.length()));
		CHECK_ODBC_ERROR(ret, connection);

		ret = SQLNumResultCols(statement, &numCols);
		CHECK_ODBC_ERROR(ret, connection);
		resultset = make_unique<ResultSet>(numCols);

		for (int i = 0; i < numCols; i++) {
			readNext(i);
		}

		resultset->endOfRows = true;
		
		return true;
	}

	bool OdbcStatement::TryExecute(const wstring& query, u_int timeout, BoundDatumSet& params)
	{
		// if the statement isn't already allocated

		bool bound = BindParams(params);
		if (!bound) {
			// error already set in BindParams
			return false;
		}

		endOfResults = true;     // reset 
		SQLRETURN ret = queryTimeout(timeout);
		CHECK_ODBC_ERROR(ret, connection);

		SQLWCHAR * sql_str = const_cast<wchar_t *>(query.c_str());
		ret = SQLExecDirect(statement, sql_str, SQL_NTS);
		if (ret != SQL_NO_DATA && !SQL_SUCCEEDED(ret))
		{
			resultset = make_unique<ResultSet>(0);
			resultset->endOfRows = true;
			RETURN_ODBC_ERROR(statement);
		}

		return StartReadingResults();
	}

	bool OdbcStatement::TryReadRow()
	{
		//column = 0; // reset

		auto ret = SQLFetch(statement);
		if (ret == SQL_NO_DATA)
		{
			resultset->endOfRows = true;
			return true;
		}
		resultset->endOfRows = false;
		CHECK_ODBC_ERROR(ret, statement);

		return true;
	}

	bool OdbcStatement::dispatch(SQLSMALLINT t, int column)
	{
		bool res;
		switch (t)
		{
		case SQL_SS_VARIANT:
			res = d_Variant(column);
			break;

		case SQL_CHAR:
		case SQL_VARCHAR:
		case SQL_LONGVARCHAR:
		case SQL_WCHAR:
		case SQL_WVARCHAR:
		case SQL_WLONGVARCHAR:
		case SQL_SS_XML:
		case SQL_GUID:
			res = d_String(column);
			break;

		case SQL_BIT:
			res = d_Bit(column);
			break;

		case SQL_SMALLINT:
		case SQL_TINYINT:
		case SQL_INTEGER:
		case SQL_C_SLONG:
		case SQL_C_SSHORT:
		case SQL_C_STINYINT:
		case SQL_C_ULONG:
		case SQL_C_USHORT:
		case SQL_C_UTINYINT:
			res = d_Integer(column);
			break;

		case SQL_DECIMAL:
		case SQL_NUMERIC:
		case SQL_REAL:
		case SQL_FLOAT:
		case SQL_DOUBLE:
		case SQL_BIGINT:
			res = d_Decimal(column);
			break;

		case SQL_BINARY:
		case SQL_VARBINARY:
		case SQL_LONGVARBINARY:
		case SQL_SS_UDT:
			res = d_Binary(column);
			break;

		case SQL_TYPE_TIMESTAMP:
		case SQL_TYPE_DATE:
		case SQL_SS_TIMESTAMPOFFSET:
			res = d_TimestampOffset(column);
			break;

		case SQL_TYPE_TIME:
		case SQL_SS_TIME2:
			res = d_Time(column);
			break;

		case SQL_TIMESTAMP:
		case SQL_DATETIME:
			res = d_Timestamp(column);
			break;

		default:
			res = d_String(column);
			break;
		}

		return res;
	}

	bool OdbcStatement::d_Variant(int column)
	{
		SQLLEN variantType;
		SQLLEN iv;
		char b;
		//Figure out the length
		auto ret = SQLGetData(statement, column + 1, SQL_C_BINARY, &b, 0, &iv);
		CHECK_ODBC_ERROR(ret, statement);
		//Figure out the type
		ret = SQLColAttribute(statement, column + 1, SQL_CA_SS_VARIANT_TYPE, nullptr, NULL, nullptr, &variantType);
		CHECK_ODBC_ERROR(ret, statement);
		// set the definiton to actual data underlying data type.
		auto & definition = resultset->GetMetadata(column);
		definition.dataType = static_cast<SQLSMALLINT>(variantType);
		auto r = TryReadColumn(column);
		return r;
	}

	bool OdbcStatement::d_Time(int column)
	{
		SQLLEN strLen_or_IndPtr;
		SQL_SS_TIME2_STRUCT time;
		memset(&time, 0, sizeof(time));

		auto ret = SQLGetData(statement, column + 1, SQL_C_DEFAULT, &time, sizeof(time), &strLen_or_IndPtr);
		CHECK_ODBC_ERROR(ret, statement);
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}

		SQL_SS_TIMESTAMPOFFSET_STRUCT datetime;
		// not necessary, but simple precaution
		memset(&datetime, 0, sizeof(datetime));
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

	bool OdbcStatement::d_TimestampOffset(int column)
	{
		SQLLEN strLen_or_IndPtr;
		SQL_SS_TIMESTAMPOFFSET_STRUCT datetime;
		memset(&datetime, 0, sizeof(datetime));

		auto ret = SQLGetData(statement, column + 1, SQL_C_DEFAULT, &datetime, sizeof(datetime), &strLen_or_IndPtr);
		CHECK_ODBC_ERROR(ret, statement);
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true; // break
		}

		resultset->SetColumn(make_shared<TimestampColumn>(datetime));

		return true;
	}

	bool OdbcStatement::d_Timestamp(int column)
	{
		TIMESTAMP_STRUCT ts;
		SQLLEN strLen_or_IndPtr;
		auto ret = SQLGetData(statement, column + 1, SQL_C_TIMESTAMP, &ts, sizeof(ts), &strLen_or_IndPtr);
		CHECK_ODBC_ERROR(ret, statement);
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true; // break
		}

		resultset->SetColumn(make_shared<TimestampColumn>(ts));

		return true;
	}

	bool OdbcStatement::d_Integer(int column)
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

	bool OdbcStatement::d_String(int column)
	{
		bool read = TryReadString(false, column);
		return read;
	}

	bool OdbcStatement::d_Bit(int column)
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
			resultset->SetColumn(make_shared<BoolColumn>(val != 0 ? true : false));
		}
		return true;
	}

	bool OdbcStatement::d_Decimal(int column)
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

	bool OdbcStatement::d_Binary(int column)
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

	bool OdbcStatement::TryReadColumn(int column)
	{
		assert(column >= 0 && column < resultset->GetColumns());
		const auto & definition = resultset->GetMetadata(column);
		return dispatch(definition.dataType, column);
	}

	bool OdbcStatement::Lob(SQLLEN display_size, int column)
	{
		SQLLEN value_len;
		bool more;
		SQLRETURN r;

		value_len = LOB_PACKET_SIZE + 1;
		auto value = make_unique<StringColumn::StringValue>(value_len);
		size_t size = sizeof(StringColumn::StringValue::value_type);

		r = SQLGetData(statement, column + 1, SQL_C_WCHAR, value->data(), value_len * size, &value_len);

		CHECK_ODBC_NO_DATA(r, statement);
		CHECK_ODBC_ERROR(r, statement);

		if (value_len == SQL_NULL_DATA) {
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}

		// an unknown amount is left on the field so no total was returned
		if (value_len == SQL_NO_TOTAL || value_len / size > LOB_PACKET_SIZE) {
			more = true;
			value->resize(LOB_PACKET_SIZE);
		}
		else {
			// value_len is in bytes
			value->resize(value_len / size);
			more = false;
		}

		resultset->SetColumn(make_shared<StringColumn>(value, more));
		return true;
	}

	bool OdbcStatement::boundedString(SQLLEN display_size, int column)
	{
		auto value = make_unique<StringColumn::StringValue>();
		size_t size = sizeof(StringColumn::StringValue::value_type);
		SQLLEN value_len = 0;
		SQLRETURN r;

		display_size++;                 // increment for null terminator
		value->resize(display_size);

		r = SQLGetData(statement, column + 1, SQL_C_WCHAR, value->data(), display_size * size, &value_len);
		CHECK_ODBC_ERROR(r, statement);
		CHECK_ODBC_NO_DATA(r, statement);

		if (value_len == SQL_NULL_DATA) {
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}

		assert(value_len % 2 == 0);   // should always be even
		value_len /= size;

		assert(value_len >= 0 && value_len <= display_size - 1);
		value->resize(value_len);

		resultset->SetColumn(make_shared<StringColumn>(value, false));

		return true;
	}

	bool OdbcStatement::TryReadString(bool binary, int column)
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

	bool OdbcStatement::TryReadNextResult()
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
}
