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
		auto size = f != params.end() ? f->getIndVec().size() : 0;
		return size;
	}

	OdbcStatement::~OdbcStatement()
	{
		//auto id = getStatementId();
		//fprintf(stderr, "destruct OdbcStatement ID = %ld\n ", id);
		//if (statement) {
		//	statement->Free();
		//}
	}

	OdbcStatement::OdbcStatement(long statementId, shared_ptr<OdbcConnectionHandle> c)
		:
		connection(c),
		error(nullptr),
		_endOfResults(true),
		statementId(static_cast<long>(statementId)),
		prepared(false),
		resultset(nullptr),
		boundParamsSet(nullptr)
	{
		//fprintf(stderr, "OdbcStatement::OdbcStatement OdbcStatement ID = %ld\n ", statementId);
		statement = make_shared<OdbcStatementHandle>();
		if (!statement->Alloc(*connection))
		{
			// todo: set error state.
		}
	}

	void OdbcStatement::applyPrecision(const BoundDatum& datum, int current_param) const
	{
		/* Modify the fields in the implicit application parameter descriptor */
		SQLHDESC hdesc = nullptr;

		SQLGetStmtAttr(statement->get(), SQL_ATTR_APP_PARAM_DESC, &hdesc, 0, nullptr);
		SQLSetDescField(hdesc, current_param, SQL_DESC_TYPE, reinterpret_cast<SQLPOINTER>(datum.c_type), 0);
		SQLSetDescField(hdesc, current_param, SQL_DESC_PRECISION, reinterpret_cast<SQLPOINTER>(datum.param_size), 0);
		SQLSetDescField(hdesc, current_param, SQL_DESC_SCALE, reinterpret_cast<SQLPOINTER>(datum.digits), 0);
		SQLSetDescField(hdesc, current_param, SQL_DESC_DATA_PTR, static_cast<SQLPOINTER>(datum.buffer), 0);
	}

	// bind all the parameters in the array
	bool OdbcStatement::BindParams(shared_ptr<BoundDatumSet> params)
	{
		auto& ps = *params;
		//fprintf(stderr, "BindParams\n");
		auto size = getSize(ps);
		if (size <= 0) return true;
		auto ret = SQLSetStmtAttr(*statement, SQL_ATTR_PARAMSET_SIZE, reinterpret_cast<SQLPOINTER>(size), 0);
		if (!CheckOdbcError(ret)) return false;
		auto current_param = 1;

		for (auto itr = ps.begin(); itr != ps.end(); ++itr)
		{
			auto& datum = *itr;
			auto r = SQLBindParameter(*statement, current_param, datum.param_type, datum.c_type, datum.sql_type, datum.param_size, datum.digits, datum.buffer, datum.buffer_len, datum.getIndVec().data());
			if (!CheckOdbcError(r)) return false;
			if (datum.getDefinedPrecision())
			{
				applyPrecision(datum, current_param);
			}
			++current_param;
		}

		return true;
	}

	Local<Array> OdbcStatement::UnbindParams() const
	{
		if (boundParamsSet != nullptr)
		{
			return boundParamsSet->unbind();
		}
		nodeTypeFactory fact;
		auto arr = fact.newArray(0);
		return arr;
	}

	Handle<Value> OdbcStatement::GetMetaValue() const
	{
		return resultset->MetaToValue();
	}

	bool OdbcStatement::endOfResults() const
	{
		return _endOfResults;
	}

	Handle<Value> OdbcStatement::EndOfResults() const
	{
		nodeTypeFactory fact;
		return fact.newBoolean(_endOfResults);
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

	bool OdbcStatement::ReturnOdbcError()
	{
		if (!statement) return false;
		error = statement->ReadErrors();
		//fprintf(stderr, "%s\n", error->Message());
		// fprintf(stderr, "RETURN_ODBC_ERROR - free statement handle\n\n");
		return false;
	}

	bool OdbcStatement::CheckOdbcError(SQLRETURN ret)
	{
		if (!SQL_SUCCEEDED(ret))
		{
			return ReturnOdbcError();
		}
		return true;
	}

	bool OdbcStatement::readColAttributes(ResultSet::ColumnDefinition& current, int column)
	{
		const size_t l = 1024;
		wchar_t typeName[l];
		SQLSMALLINT typeNameLen;
		auto index = column + 1;
		const auto width = sizeof(wchar_t);
		auto ret = SQLColAttribute(*statement, index, SQL_DESC_TYPE_NAME, typeName, l * width, &typeNameLen, nullptr);
		if (!CheckOdbcError(ret)) return false;

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
				ret = SQLColAttribute(*statement, index, SQL_CA_SS_UDT_TYPE_NAME, udtTypeName, l * width, &udtTypeNameLen, nullptr);
				if (!CheckOdbcError(ret)) return false;
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
		auto index = column + 1;
		auto ret = SQLDescribeCol(*statement, index, nullptr, 0, &nameLength, nullptr, nullptr, nullptr, nullptr);
		if (!CheckOdbcError(ret)) return false;

		auto& current = resultset->GetMetadata(column);
		vector<wchar_t> buffer(nameLength + 1);
		ret = SQLDescribeCol(*statement, index, buffer.data(), nameLength + 1, &nameLength, &current.dataType, &current.columnSize, &current.decimalDigits, &current.nullable);
		if (!CheckOdbcError(ret)) return false;
		current.name = wstring(buffer.data(), nameLength);

		ret = readColAttributes(current, column);
		if (!CheckOdbcError(ret)) return false;

		return ret;
	}

	bool OdbcStatement::StartReadingResults()
	{
		SQLSMALLINT columns;
		auto ret = SQLNumResultCols(*statement, &columns);
		if (!CheckOdbcError(ret)) return false;

		auto column = 0;
		resultset = make_unique<ResultSet>(columns);

		while (column < resultset->GetColumns())
		{
			if (!readNext(column++))
			{
				return false;
			}
		}

		ret = SQLRowCount(*statement, &resultset->rowcount);
		if (!CheckOdbcError(ret)) return false;

		return true;
	}

	SQLRETURN OdbcStatement::queryTimeout(int timeout)
	{
		if (timeout > 0)
		{
			auto to = reinterpret_cast<SQLPOINTER>(static_cast<UINT_PTR>(timeout));
			auto ret = SQLSetStmtAttr(*statement, SQL_QUERY_TIMEOUT, to, SQL_IS_UINTEGER);
			if (!CheckOdbcError(ret)) return false;
			SQLSetStmtAttr(*statement, SQL_ATTR_QUERY_TIMEOUT, to, SQL_IS_UINTEGER);
			if (!CheckOdbcError(ret)) return false;
		}
		return true;
	}

	bool OdbcStatement::TryPrepare(const wstring& query, u_int timeout)
	{
		auto* sql_str = const_cast<SQLWCHAR *>(query.c_str());
		SQLSMALLINT numCols;

		auto ret = SQLPrepare(*statement, sql_str, static_cast<SQLINTEGER>(query.length()));
		if (!CheckOdbcError(ret)) return false;

		ret = SQLNumResultCols(*statement, &numCols);
		if (!CheckOdbcError(ret)) return false;

		preparedStorage = make_shared<BoundDatumSet>();
		resultset = make_unique<ResultSet>(numCols);

		for (auto i = 0; i < numCols; i++)
		{
			readNext(i);
		}

		preparedStorage->reserve(resultset);

		auto i = 0;
		for (auto itr = preparedStorage->begin(); itr != preparedStorage->end(); ++itr)
		{
			auto& datum = *itr;
			ret = SQLBindCol(*statement, i + 1, datum.c_type, datum.buffer, datum.buffer_len, datum.getIndVec().data());
			if (!CheckOdbcError(ret)) return false;
			++i;
		}

		resultset->endOfRows = true;
		prepared = true;

		return true;
	}

	bool OdbcStatement::BindFetch(shared_ptr<BoundDatumSet> paramSet)
	{
		auto bound = BindParams(paramSet);
		if (!bound)
		{
			// error already set in BindParams
			return false;
		}
		auto ret = SQLExecute(*statement);
		if (!CheckOdbcError(ret)) return false;

		ret = SQLRowCount(*statement, &resultset->rowcount);
		if (!CheckOdbcError(ret)) return false;

		return true;
	}

	bool OdbcStatement::TryExecuteDirect(const wstring& query, u_int timeout, shared_ptr<BoundDatumSet> paramSet)
	{
		auto bound = BindParams(paramSet);
		if (!bound)
		{
			// error already set in BindParams
			return false;
		}

		_endOfResults = true; // reset 
		auto ret = queryTimeout(timeout);
		if (!CheckOdbcError(ret)) return false;
		auto* sql_str = const_cast<wchar_t *>(query.c_str());
		ret = SQLExecDirect(*statement, sql_str, SQL_NTS);
		if (
			(ret == SQL_SUCCESS_WITH_INFO) ||
			(ret != SQL_NO_DATA && !SQL_SUCCEEDED(ret)))
		{
			ReturnOdbcError();
			boundParamsSet = paramSet;
			auto saved_errors = error;
			auto res = StartReadingResults();
			error = saved_errors;
			if (res)
			{
				resultset->endOfRows = false;
			}
			else
			{
				resultset = make_unique<ResultSet>(0);
				resultset->endOfRows = true;
			}

			return false;
		}
		boundParamsSet = paramSet;
		return StartReadingResults();
	}

	bool OdbcStatement::TryReadRow()
	{
		//column = 0; // reset
		//fprintf(stderr, "TryReadRow\n");

		if (resultset == nullptr) return false;
		if (!statement) return false;

		auto ret = SQLFetch(*statement);

		if (ret == SQL_NO_DATA)
		{
			resultset->endOfRows = true;
			return true;
		}
		resultset->endOfRows = false;
		if (!CheckOdbcError(ret)) return false;

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

		case SQL_SS_TIMESTAMPOFFSET:
			res = d_TimestampOffset(column);
			break;

		case SQL_TYPE_TIME:
		case SQL_SS_TIME2:
			res = d_Time(column);
			break;

		case SQL_TIMESTAMP:
		case SQL_DATETIME:
		case SQL_TYPE_TIMESTAMP:
		case SQL_TYPE_DATE:
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
		auto ret = SQLGetData(*statement, column + 1, SQL_C_BINARY, &b, 0, &iv);
		if (!CheckOdbcError(ret)) return false;
		//Figure out the type
		ret = SQLColAttribute(*statement, column + 1, SQL_CA_SS_VARIANT_TYPE, nullptr, NULL, nullptr, &variantType);
		if (!CheckOdbcError(ret)) return false;
		// set the definiton to actual data underlying data type.
		auto& definition = resultset->GetMetadata(column);
		definition.dataType = static_cast<SQLSMALLINT>(variantType);
		auto r = TryReadColumn(column);
		return r;
	}

	bool OdbcStatement::d_Time(int column)
	{
		SQLLEN strLen_or_IndPtr;
		SQL_SS_TIME2_STRUCT time;
		memset(&time, 0, sizeof(time));

		auto ret = SQLGetData(*statement, column + 1, SQL_C_DEFAULT, &time, sizeof(time), &strLen_or_IndPtr);
		if (!CheckOdbcError(ret)) return false;
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

	bool OdbcStatement::getDataTimestampOffset(int column)
	{
		auto storage = make_shared<DatumStorage>();
		storage->ReserveTimestampOffset(1);
		SQLLEN strLen_or_IndPtr;

		auto ret = SQLGetData(*statement, column + 1, SQL_C_DEFAULT, storage->timestampoffsetvec_ptr->data(), sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT), &strLen_or_IndPtr);
		if (!CheckOdbcError(ret)) return false;
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true; // break
		}
		resultset->SetColumn(make_shared<TimestampColumn>(storage));
		return true;
	}

	bool OdbcStatement::d_TimestampOffset(int column)
	{
		shared_ptr<IntColumn> colVal;
		if (prepared)
		{
			auto& datum = preparedStorage->atIndex(column);
			auto storage = datum.getStorage();
			resultset->SetColumn(make_shared<TimestampColumn>(storage));
			return true;
		}
		getDataTimestampOffset(column);
		return true;
	}

	bool OdbcStatement::getDataTimestamp(int column)
	{
		auto storage = make_shared<DatumStorage>();
		storage->ReserveTimestamp(1);
		SQLLEN strLen_or_IndPtr;
		auto ret = SQLGetData(*statement, column + 1, SQL_C_TIMESTAMP, storage->timestampvec_ptr->data(), sizeof(TIMESTAMP_STRUCT), &strLen_or_IndPtr);
		if (!CheckOdbcError(ret)) return false;
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true; // break
		}
		resultset->SetColumn(make_shared<TimestampColumn>(storage));
		return true;
	}

	bool OdbcStatement::d_Timestamp(int column)
	{
		shared_ptr<IntColumn> colVal;
		if (prepared)
		{
			auto& datum = preparedStorage->atIndex(column);
			auto storage = datum.getStorage();
			resultset->SetColumn(make_shared<TimestampColumn>(storage));
			return true;
		}
		getDataTimestamp(column);
		return true;
	}

	bool OdbcStatement::getDataLong(int column)
	{
		auto storage = make_shared<DatumStorage>();
		storage->ReserveInt64(1);
		SQLLEN strLen_or_IndPtr;
		auto ret = SQLGetData(*statement, column + 1, SQL_C_SLONG, storage->int64vec_ptr->data(), sizeof(int64_t), &strLen_or_IndPtr);
		if (!CheckOdbcError(ret)) return false;
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}
		resultset->SetColumn(make_shared<IntColumn>(storage));
		return true;
	}

	bool OdbcStatement::d_Integer(int column)
	{
		shared_ptr<IntColumn> colVal;
		if (prepared)
		{
			auto& datum = preparedStorage->atIndex(column);
			auto storage = datum.getStorage();
			resultset->SetColumn(make_shared<IntColumn>(storage));
			return true;
		}
		getDataLong(column);
		return true;
	}

	bool OdbcStatement::d_String(int column)
	{
		auto read = TryReadString(false, column);
		return read;
	}

	bool OdbcStatement::getDataBit(int column)
	{
		auto storage = make_shared<DatumStorage>();
		storage->ReserveChars(1);
		SQLLEN strLen_or_IndPtr;
		auto ret = SQLGetData(*statement, column + 1, SQL_C_BIT, storage->charvec_ptr->data(), sizeof(byte), &strLen_or_IndPtr);
		if (!CheckOdbcError(ret)) return false;
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}
		resultset->SetColumn(make_shared<BoolColumn>(storage));
		return true;
	}

	bool OdbcStatement::d_Bit(int column)
	{
		if (prepared)
		{
			auto& datum = preparedStorage->atIndex(column);
			auto storage = datum.getStorage();
			resultset->SetColumn(make_shared<BoolColumn>(storage));
			return true;
		}
		getDataBit(column);
		return true;
	}

	bool OdbcStatement::getDataDecimal(int column)
	{
		auto storage = make_shared<DatumStorage>();
		storage->ReserveDouble(1);
		SQLLEN strLen_or_IndPtr;
		auto ret = SQLGetData(*statement, column + 1, SQL_C_DOUBLE, storage->doublevec_ptr->data(), sizeof(double), &strLen_or_IndPtr);
		if (!CheckOdbcError(ret)) return false;
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}
		resultset->SetColumn(make_shared<NumberColumn>(storage));
		return true;
	}

	bool OdbcStatement::d_Decimal(int column)
	{
		if (prepared)
		{
			auto& datum = preparedStorage->atIndex(column);
			auto storage = datum.getStorage();
			resultset->SetColumn(make_shared<NumberColumn>(storage));
			return true;
		}
		return getDataDecimal(column);
	}

	bool OdbcStatement::getDataBinary(int column)
	{
		auto storage = make_shared<DatumStorage>();
		SQLLEN amount = 2048;
		storage->ReserveChars(amount);
		SQLLEN strLen_or_IndPtr;
		auto more = false;
		auto ret = SQLGetData(*statement, column + 1, SQL_C_BINARY, storage->charvec_ptr->data(), amount, &strLen_or_IndPtr);
		if (!CheckOdbcError(ret)) return false;
		if (strLen_or_IndPtr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}
		assert(strLen_or_IndPtr != SQL_NO_TOTAL);
		// per http://msdn.microsoft.com/en-us/library/windows/desktop/ms715441(v=vs.85).aspx

		SQLWCHAR SQLState[6];
		SQLINTEGER nativeError;
		SQLSMALLINT textLength;
		if (ret == SQL_SUCCESS_WITH_INFO)
		{
			ret = SQLGetDiagRec(SQL_HANDLE_STMT, *statement, 1, SQLState, &nativeError, nullptr, 0, &textLength);
			if (!CheckOdbcError(ret)) return false;
			more = wcsncmp(SQLState, L"01004", 6) == 0;
		}

		amount = strLen_or_IndPtr;
		if (more)
		{
			amount = storage->charvec_ptr->size();
		}

		resultset->SetColumn(make_shared<BinaryColumn>(storage, amount, more));

		return true;
	}

	bool OdbcStatement::d_Binary(int column)
	{
		if (prepared)
		{
			auto more = false;
			auto& datum = preparedStorage->atIndex(column);
			auto storage = datum.getStorage();
			auto& ind = datum.getIndVec();
			SQLLEN amount = ind[0];
			resultset->SetColumn(make_shared<BinaryColumn>(storage, amount, more));
			return true;
		}

		return getDataBinary(column);
	}

	bool OdbcStatement::TryReadColumn(int column)
	{
		//fprintf(stderr, "TryReadColumn %d\n", column);
		assert(column >= 0 && column < resultset->GetColumns());
		const auto& definition = resultset->GetMetadata(column);
		return dispatch(definition.dataType, column);
	}

	bool OdbcStatement::Lob(SQLLEN display_size, int column)
	{
		bool more;
		auto storage = make_shared<DatumStorage>();
		SQLLEN value_len = LOB_PACKET_SIZE + 1;
		storage->ReserveUint16(value_len);
		auto size = sizeof(uint16_t);

		auto r = SQLGetData(*statement, column + 1, SQL_C_WCHAR, storage->uint16vec_ptr->data(), value_len * size, &value_len);

		//CHECK_ODBC_NO_DATA(r, statement);
		if (!CheckOdbcError(r)) return false;

		if (value_len == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}

		// an unknown amount is left on the field so no total was returned
		if (value_len == SQL_NO_TOTAL || value_len / size > LOB_PACKET_SIZE)
		{
			more = true;
			storage->uint16vec_ptr->resize(LOB_PACKET_SIZE);
		}
		else
		{
			// value_len is in bytes
			storage->uint16vec_ptr->resize(value_len / size);
			more = false;
		}

		resultset->SetColumn(make_shared<StringColumn>(storage, storage->uint16vec_ptr->size(), more));
		return true;
	}

	bool OdbcStatement::reservedString(SQLLEN display_size, int column) const
	{
		auto& storage = preparedStorage->atIndex(column);
		auto& ind = storage.getIndVec();
		auto size = sizeof(uint16_t);
		auto value_len = ind[0];
		value_len /= size;
		auto value = make_shared<StringColumn>(storage.getStorage(), value_len);
		resultset->SetColumn(value);
		return true;
	}

	bool OdbcStatement::boundedString(SQLLEN display_size, int column)
	{
		auto storage = make_shared<DatumStorage>();
		auto size = sizeof(uint16_t);
		SQLLEN value_len = 0;

		display_size++;
		storage->ReserveUint16(display_size); // increment for null terminator

		auto r = SQLGetData(*statement, column + 1, SQL_C_WCHAR, storage->uint16vec_ptr->data(), display_size * size, &value_len);
		if (!CheckOdbcError(r)) return false;
		//CHECK_ODBC_NO_DATA(r, statement);

		if (value_len == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}

		assert(value_len % 2 == 0); // should always be even
		value_len /= size;

		assert(value_len >= 0 && value_len <= display_size - 1);
		storage->uint16vec_ptr->resize(value_len);
		auto value = make_shared<StringColumn>(storage, value_len, false);
		resultset->SetColumn(value);

		return true;
	}

	bool OdbcStatement::TryReadString(bool binary, int column)
	{
		SQLLEN display_size = 0;

		auto r = SQLColAttribute(*statement, column + 1, SQL_DESC_DISPLAY_SIZE, nullptr, 0, nullptr, &display_size);
		if (!CheckOdbcError(r)) return false;

		// when a field type is LOB, we read a packet at time and pass that back.
		if (display_size == 0 || display_size == numeric_limits<int>::max() ||
			display_size == numeric_limits<int>::max() >> 1 ||
			display_size == numeric_limits<unsigned long>::max() - 1)
		{
			return Lob(display_size, column);
		}

		if (display_size >= 1 && display_size <= SQL_SERVER_MAX_STRING_SIZE)
		{
			return prepared ? reservedString(display_size, column) : boundedString(display_size, column);
		}

		assert(false);

		return false;
	}

	bool OdbcStatement::TryReadNextResult()
	{
		//fprintf(stderr, "TryReadNextResult\n");
		//fprintf(stderr, "TryReadNextResult ID = %llu\n ", getStatementId());
		auto ret = SQLMoreResults(*statement);

		if (ret == SQL_NO_DATA)
		{
			//fprintf(stderr, "SQL_NO_DATA\n");
			_endOfResults = true;
			if (prepared)
			{
				SQLCloseCursor(*statement);
			}
			return true;
		}
		if (ret == SQL_SUCCESS_WITH_INFO)
		{
			ReturnOdbcError();
			auto saved_errors = error;
			auto res = StartReadingResults();
			if (res)
			{
				resultset->endOfRows = false;
			}else
			{
				resultset->endOfRows = true;
			}
			return false;
		}
		_endOfResults = false;
		return StartReadingResults();
	}
}
