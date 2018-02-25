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

#include <v8.h>
#include <OdbcStatement.h>
#include <BoundDatum.h>
#include <BoundDatumSet.h>
#include <NodeColumns.h>
#include <OdbcHelper.h>
#include <QueryOperationParams.h>

namespace mssql
{
	// internal constants

	size_t get_size(BoundDatumSet& params)
	{
		const auto f = params.begin();
		if (f == params.end()) return 0;
		auto p = *f;
		if (p->is_tvp)
		{
			//return p->param_size;
		}
		const auto size = p->get_ind_vec().size();
		return size;
	}

	OdbcStatement::~OdbcStatement()
	{
		//auto id = getStatementId();
		//fprintf(stderr, "destruct OdbcStatement ID = %ld\n ", id);
		//if (statement) {
		//	statement->Free();
		//}
		_statementState = STATEMENT_CLOSED;
	}

	OdbcStatement::OdbcStatement(const long statement_id, const shared_ptr<OdbcConnectionHandle> c)
		:
		_connection(c),
		error(nullptr),
		_endOfResults(true),
		_statementId(static_cast<long>(statement_id)),
		_prepared(false),
		_cancelRequested(false),
		_pollingEnabled(false),
		resultset(nullptr),
		boundParamsSet(nullptr)
	{
		//fprintf(stderr, "OdbcStatement::OdbcStatement OdbcStatement ID = %ld\n ", statementId);
		_statement = make_shared<OdbcStatementHandle>();
		if (!_statement->alloc(*_connection))
		{
		}
	}

	void OdbcStatement::apply_precision(const shared_ptr<BoundDatum>& datum, const int current_param) const
	{
		/* Modify the fields in the implicit application parameter descriptor */
		SQLHDESC hdesc = nullptr;

		SQLGetStmtAttr(_statement->get(), SQL_ATTR_APP_PARAM_DESC, &hdesc, 0, nullptr);
		SQLSetDescField(hdesc, current_param, SQL_DESC_TYPE, reinterpret_cast<SQLPOINTER>(datum->c_type), 0);
		SQLSetDescField(hdesc, current_param, SQL_DESC_PRECISION, reinterpret_cast<SQLPOINTER>(datum->param_size), 0);
		SQLSetDescField(hdesc, current_param, SQL_DESC_SCALE, reinterpret_cast<SQLPOINTER>(datum->digits), 0);
		SQLSetDescField(hdesc, current_param, SQL_DESC_DATA_PTR, static_cast<SQLPOINTER>(datum->buffer), 0);
	}

	// this will show on a different thread to the current executing query.
	bool OdbcStatement::cancel()
	{
		lock_guard<mutex> lock(g_i_mutex);
		if (_pollingEnabled)
		{
			_cancelRequested = true;
			return true;
		}
		SQLINTEGER native_error = -1;
		auto c_state = "CANCEL";
		auto c_msg = "Error: [msnodesql] cancel only supported for statements where polling is enabled.";
		error = make_shared<OdbcError>(c_state, c_msg, native_error);
		return false;
	}

	bool OdbcStatement::set_polling(const bool mode)
	{
		lock_guard<mutex> lock(g_i_mutex);
		_pollingEnabled = mode;
		return true;
	}

	bool OdbcStatement::bind_tvp(vector<tvp_t>& tvps)
	{
		const auto& statement = *_statement;
		for (auto itr = tvps.begin(); itr != tvps.end(); ++itr)
		{
			auto tvpret = SQLSetStmtAttr(statement, SQL_SOPT_SS_PARAM_FOCUS,
			                             reinterpret_cast<SQLPOINTER>(itr->first), SQL_IS_INTEGER);
			if (!check_odbc_error(tvpret))
			{
				return false;
			}
			auto current_param = 1;
			auto col_set = itr->second;
			for (auto col_itr = col_set->begin(); col_itr != col_set->end(); ++col_itr)
			{
				bind_datum(current_param, *col_itr);
				current_param++;
			}
			tvpret = SQLSetStmtAttr(statement, SQL_SOPT_SS_PARAM_FOCUS,
			                        static_cast<SQLPOINTER>(nullptr), SQL_IS_INTEGER);
			if (!check_odbc_error(tvpret))
			{
				return false;
			}
		}
		return true;
	}

	bool OdbcStatement::bind_datum(const int current_param, const shared_ptr<BoundDatum> &datum)
	{
		const auto& statement = *_statement;
		const auto r = SQLBindParameter(statement, current_param, datum->param_type, datum->c_type, datum->sql_type,
		                                datum->param_size, datum->digits, datum->buffer, datum->buffer_len,
		                                datum->get_ind_vec().data());
		if (!check_odbc_error(r)) return false;
		if (datum->get_defined_precision())
		{
			apply_precision(datum, current_param);
		}
		return true;
	}

	void OdbcStatement::queue_tvp(int current_param, param_bindings::iterator& itr,  shared_ptr<BoundDatum> &datum, vector<tvp_t>& tvps) 
	{
		SQLHANDLE ipd;
		const auto& statement = *_statement;
		SQLINTEGER string_length;
		SQLTCHAR parameter_type_name[256];
		auto r = SQLGetStmtAttr(statement, SQL_ATTR_IMP_PARAM_DESC, &ipd, SQL_IS_POINTER, &string_length);
		if (!check_odbc_error(r)) return;
		auto schema = datum->get_storage()->schema;		
		if (!schema.empty()) {
			const auto schema_ptr = const_cast<wchar_t*>(schema.c_str());
			r = SQLSetDescField(ipd, current_param, SQL_CA_SS_SCHEMA_NAME, reinterpret_cast<SQLPOINTER>(schema_ptr), schema.size() * sizeof(wchar_t));
			if (!check_odbc_error(r)) return;
			r = SQLGetDescField(ipd, current_param, SQL_CA_SS_SCHEMA_NAME, parameter_type_name, sizeof(parameter_type_name), &string_length);
			if (!check_odbc_error(r)) return;
		}
		tvp_t tvp;
		auto cols = make_shared<BoundDatumSet::param_bindings>();
		for (auto c = 1; c <= datum->tvp_no_cols; ++c)
		{
			++itr;
			const auto& col_datum = *itr;
			cols->push_back(col_datum);
		}
		tvps.emplace_back(current_param, cols);
	}

	/*
	SQLHDESC hdesc = nullptr;
	SQLGetStmtAttr(statement, SQL_ATTR_IMP_PARAM_DESC, &hdesc, 0, nullptr);
	const auto char_vec = (*datum).get_storage()->uint16vec_ptr;
	const auto d = char_vec->data();
	SQLSetDescField(hdesc, current_param, SQL_CA_SS_TYPE_NAME, static_cast<SQLPOINTER>(d), char_vec->size() * sizeof(WCHAR));
	*/

	// bind all the parameters in the array
	bool OdbcStatement::bind_params(const shared_ptr<BoundDatumSet> &params)
	{
		auto& ps = *params;
		//fprintf(stderr, "BindParams\n");
		const auto size = get_size(ps);
		if (size <= 0) return true;
		const auto& statement = *_statement;
		if (size > 1)
		{
			const auto ret = SQLSetStmtAttr(statement, SQL_ATTR_PARAMSET_SIZE, reinterpret_cast<SQLPOINTER>(size), 0);
			if (!check_odbc_error(ret)) return false;
		}
		auto current_param = 1;

		vector<tvp_t> tvps;
		for (auto itr = ps.begin(); itr != ps.end(); ++itr)
		{
			auto& datum = *itr;
			bind_datum(current_param, datum);
			if (datum->is_tvp)
			{
				queue_tvp(current_param, itr, datum, tvps);
			}
			++current_param;
		}
		bind_tvp(tvps);

		return true;
	}

	Local<Array> OdbcStatement::unbind_params() const
	{
		if (boundParamsSet != nullptr)
		{
			return boundParamsSet->unbind();
		}
		nodeTypeFactory fact;
		const auto arr = fact.newArray(0);
		return arr;
	}

	Handle<Value> OdbcStatement::get_meta_value() const
	{
		return resultset->meta_to_value();
	}

	bool OdbcStatement::end_of_results() const
	{
		return _endOfResults;
	}

	Handle<Value> OdbcStatement::handle_end_of_results() const
	{
		nodeTypeFactory fact;
		return fact.newBoolean(_endOfResults);
	}

	Handle<Value> OdbcStatement::end_of_rows() const
	{
		nodeTypeFactory fact;
		return fact.newBoolean(resultset->EndOfRows());
	}

	Handle<Value> OdbcStatement::get_column_value() const
	{
		nodeTypeFactory fact;
		auto result = fact.newObject();
		auto column = resultset->get_column();
		result->Set(fact.fromTwoByte(L"data"), column->ToValue());
		result->Set(fact.fromTwoByte(L"more"), fact.newBoolean(column->More()));
		return result;
	}

	bool OdbcStatement::return_odbc_error()
	{
		if (!_statement) return false;
		error = _statement->read_errors();
		//fprintf(stderr, "%s\n", error->Message());
		// fprintf(stderr, "RETURN_ODBC_ERROR - free statement handle\n\n");
		return false;
	}

	bool OdbcStatement::check_odbc_error(SQLRETURN ret)
	{
		if (!SQL_SUCCEEDED(ret))
		{
			_statementState = STATEMENT_ERROR;
			return return_odbc_error();
		}
		return true;
	}

	bool OdbcStatement::read_col_attributes(ResultSet::ColumnDefinition& current, const int column)
	{
		const size_t l = 1024;
		wchar_t type_name[l];
		SQLSMALLINT type_name_len;
		const auto index = column + 1;
		const auto width = sizeof(wchar_t);
		auto ret = SQLColAttribute(*_statement, index, SQL_DESC_TYPE_NAME, type_name, l * width, &type_name_len, nullptr);
		if (!check_odbc_error(ret)) return false;

		current.dataTypeName = wstring(type_name, type_name_len);

		switch (current.dataType)
		{
		case SQL_SS_VARIANT:
			{
				// dispatch as variant type which reads underlying column type and re-reads correctly.
			}
			break;

		case SQL_SS_UDT:
			{
				wchar_t udt_type_name[l];
				SQLSMALLINT udt_type_name_len;
				ret = SQLColAttribute(*_statement, index, SQL_CA_SS_UDT_TYPE_NAME, udt_type_name, l * width, &udt_type_name_len,
				                      nullptr);
				if (!check_odbc_error(ret)) return false;
				current.udtTypeName = wstring(udt_type_name, udt_type_name_len);
			}
			break;

		default:
			break;
		}

		return true;
	}

	bool OdbcStatement::read_next(const int column)
	{
		const auto& statement = *_statement;
		SQLSMALLINT name_length;
		const auto index = column + 1;
		auto ret = SQLDescribeCol(statement, index, nullptr, 0, &name_length, nullptr, nullptr, nullptr, nullptr);
		if (!check_odbc_error(ret)) return false;

		auto& current = resultset->get_meta_data(column);
		vector<wchar_t> buffer(name_length + 1);
		ret = SQLDescribeCol(statement, index, buffer.data(), name_length + 1, &name_length, &current.dataType,
		                     &current.columnSize, &current.decimalDigits, &current.nullable);
		if (!check_odbc_error(ret)) return false;
		current.name = wstring(buffer.data(), name_length);

		ret = read_col_attributes(current, column);
		if (!check_odbc_error(ret)) return false;

		return ret;
	}

	bool OdbcStatement::start_reading_results()
	{
		SQLSMALLINT columns;
		const auto& statement = *_statement;
		auto ret = SQLNumResultCols(statement, &columns);
		if (!check_odbc_error(ret)) return false;

		auto column = 0;
		resultset = make_unique<ResultSet>(columns);

		while (column < static_cast<int>(resultset->get_column_count()))
		{
			if (!read_next(column++))
			{
				return false;
			}
		}

		ret = SQLRowCount(statement, &resultset->rowcount);
		return check_odbc_error(ret);
	}

	SQLRETURN OdbcStatement::query_timeout(const int timeout)
	{
		const auto& statement = *_statement;
		if (timeout > 0)
		{
			const auto to = reinterpret_cast<SQLPOINTER>(static_cast<UINT_PTR>(timeout));
			const auto ret = SQLSetStmtAttr(statement, SQL_QUERY_TIMEOUT, to, SQL_IS_UINTEGER);
			if (!check_odbc_error(ret)) return false;
			SQLSetStmtAttr(statement, SQL_ATTR_QUERY_TIMEOUT, to, SQL_IS_UINTEGER);
			if (!check_odbc_error(ret)) return false;
		}
		return true;
	}

	bool OdbcStatement::try_prepare(const shared_ptr<QueryOperationParams> &q)
	{
		const auto& statement = *_statement;
		_query = q;
		auto query = q->query_string();
		auto* sql_str = const_cast<SQLWCHAR *>(query.c_str());
		SQLSMALLINT num_cols;

		auto ret = SQLPrepare(statement, sql_str, static_cast<SQLINTEGER>(query.length()));
		if (!check_odbc_error(ret)) return false;

		ret = SQLNumResultCols(statement, &num_cols);
		if (!check_odbc_error(ret)) return false;

		_preparedStorage = make_shared<BoundDatumSet>();
		resultset = make_unique<ResultSet>(num_cols);

		for (auto i = 0; i < num_cols; i++)
		{
			read_next(i);
		}

		auto reserved=  _preparedStorage->reserve(resultset);

		auto i = 0;
		for (auto itr = _preparedStorage->begin(); itr != _preparedStorage->end(); ++itr)
		{
			auto& datum = *itr;
			ret = SQLBindCol(statement, i + 1, datum->c_type, datum->buffer, datum->buffer_len, datum->get_ind_vec().data());
			if (!check_odbc_error(ret)) return false;
			++i;
		}

		resultset->endOfRows = true;
		_prepared = true;

		_statementState = STATEMENT_PREPARED;

		return true;
	}

	SQLRETURN OdbcStatement::poll_check(SQLRETURN ret, const bool direct)
	{
		const auto& statement = *_statement;

		if (ret == SQL_STILL_EXECUTING)
		{
			while (true)
			{
				if (direct)
				{
					ret = SQLExecDirect(statement, reinterpret_cast<SQLWCHAR*>(""), SQL_NTS);
				}
				else
				{
					ret = SQLExecute(statement);
				}

				bool submit_cancel;
				if (ret != SQL_STILL_EXECUTING)
				{
					break;
				}

				Sleep(1); // wait 1 MS			
				{
					lock_guard<mutex> lock(g_i_mutex);
					submit_cancel = _cancelRequested;
				}

				if (submit_cancel)
				{
					cancel_handle();
				}
			}
		}
		return ret;
	}

	bool OdbcStatement::bind_fetch(const shared_ptr<BoundDatumSet> & param_set)
	{
		const auto& statement = *_statement;

		bool polling_mode;
		{
			lock_guard<mutex> lock(g_i_mutex);
			polling_mode = _pollingEnabled;
		}
		const auto bound = bind_params(param_set);
		if (!bound)
		{
			// error already set in BindParams
			return false;
		}
		if (polling_mode)
		{
			SQLSetStmtAttr(statement, SQL_ATTR_ASYNC_ENABLE, reinterpret_cast<SQLPOINTER>(SQL_ASYNC_ENABLE_ON), 0);
		}
		auto ret = SQLExecute(statement);
		if (polling_mode)
		{
			ret = poll_check(ret, false);
		}

		if (!check_odbc_error(ret)) return false;

		ret = SQLRowCount(statement, &resultset->rowcount);
		return check_odbc_error(ret);
	}

	void OdbcStatement::cancel_handle()
	{
		SQLINTEGER native_error = -1;
		auto c_state = "CANCEL";
		auto c_msg = "Error: [msnodesql] Operation canceled.";
		error2 = make_shared<OdbcError>(c_state, c_msg, native_error);
		auto hnd = *_statement;
		const auto ret2 = SQLCancelHandle(hnd.HandleType, hnd.get());
		if (!check_odbc_error(ret2))
		{
			fprintf(stderr, "cancel req failed state %d %ld \n", _statementState, _statementId);
		}
		{
			lock_guard<mutex> lock(g_i_mutex);
			_cancelRequested = false;
		}
	}

	bool OdbcStatement::try_execute_direct(const shared_ptr<QueryOperationParams> &q, const shared_ptr<BoundDatumSet> &param_set)
	{
		_query = q;
		const auto timeout = q->timeout();
		const auto bound = bind_params(param_set);
		if (!bound)
		{
			// error already set in BindParams
			return false;
		}
		bool polling_mode;
		{
			lock_guard<mutex> lock(g_i_mutex);
			polling_mode = _pollingEnabled;
		}
		_endOfResults = true; // reset 
		auto ret = query_timeout(timeout);
		if (!check_odbc_error(ret)) return false;
		auto query = q->query_string();
		auto* sql_str = const_cast<wchar_t *>(query.c_str());
		_statementState = STATEMENT_SUBMITTED;
		if (polling_mode)
		{
			SQLSetStmtAttr(*_statement, SQL_ATTR_ASYNC_ENABLE, reinterpret_cast<SQLPOINTER>(SQL_ASYNC_ENABLE_ON), 0);
		}
		ret = SQLExecDirect(*_statement, sql_str, SQL_NTS);

		if (polling_mode)
		{
			ret = poll_check(ret, true);
		}

		if (
			(ret == SQL_SUCCESS_WITH_INFO) ||
			(ret != SQL_NO_DATA && !SQL_SUCCEEDED(ret)))
		{
			return_odbc_error();
			boundParamsSet = param_set;
			const auto saved_errors = error;
			const auto res = start_reading_results();
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
		boundParamsSet = param_set;
		return start_reading_results();
	}

	bool OdbcStatement::try_read_row()
	{
		//column = 0; // reset
		//fprintf(stderr, "TryReadRow\n");

		if (resultset == nullptr) return false;
		if (!_statement) return false;
		const auto& statement = *_statement;

		const auto ret = SQLFetch(statement);

		if (ret == SQL_NO_DATA)
		{
			resultset->endOfRows = true;
			return true;
		}
		_statementState = STATEMENT_FETCHING;
		resultset->endOfRows = false;
		return check_odbc_error(ret);
	}

	bool OdbcStatement::dispatch(const SQLSMALLINT t, const int column)
	{
		bool res;
		switch (t)
		{
		case SQL_SS_VARIANT:
			res = d_variant(column);
			break;

		case SQL_CHAR:
		case SQL_VARCHAR:
		case SQL_LONGVARCHAR:
		case SQL_WCHAR:
		case SQL_WVARCHAR:
		case SQL_WLONGVARCHAR:
		case SQL_SS_XML:
		case SQL_GUID:
			res = d_string(column);
			break;

		case SQL_BIT:
			res = d_bit(column);
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
			res = d_integer(column);
			break;

		case SQL_DECIMAL:
		case SQL_NUMERIC:
		case SQL_REAL:
		case SQL_FLOAT:
		case SQL_DOUBLE:
		case SQL_BIGINT:
			res = d_decimal(column);
			break;

		case SQL_BINARY:
		case SQL_VARBINARY:
		case SQL_LONGVARBINARY:
		case SQL_SS_UDT:
			res = d_binary(column);
			break;

		case SQL_SS_TIMESTAMPOFFSET:
			res = d_timestamp_offset(column);
			break;

		case SQL_TYPE_TIME:
		case SQL_SS_TIME2:
			res = d_time(column);
			break;

		case SQL_TIMESTAMP:
		case SQL_DATETIME:
		case SQL_TYPE_TIMESTAMP:
		case SQL_TYPE_DATE:
			res = d_timestamp(column);
			break;

		default:
			res = d_string(column);
			break;
		}

		return res;
	}

	bool OdbcStatement::d_variant(const int column)
	{
		const auto& statement = *_statement;
		SQLLEN variant_type;
		SQLLEN iv;
		char b;
		//Figure out the length
		auto ret = SQLGetData(statement, column + 1, SQL_C_BINARY, &b, 0, &iv);
		if (!check_odbc_error(ret)) return false;
		//Figure out the type
		ret = SQLColAttribute(statement, column + 1, SQL_CA_SS_VARIANT_TYPE, nullptr, NULL, nullptr, &variant_type);
		if (!check_odbc_error(ret)) return false;
		// set the definiton to actual data underlying data type.
		auto& definition = resultset->get_meta_data(column);
		definition.dataType = static_cast<SQLSMALLINT>(variant_type);
		const auto r = try_read_column(column);
		return r;
	}

	bool OdbcStatement::d_time(const int column)
	{
		const auto& statement = *_statement;
		SQLLEN str_len_or_ind_ptr;
		SQL_SS_TIME2_STRUCT time;
		memset(&time, 0, sizeof(time));

		const auto ret = SQLGetData(statement, column + 1, SQL_C_DEFAULT, &time, sizeof(time), &str_len_or_ind_ptr);
		if (!check_odbc_error(ret)) return false;
		if (str_len_or_ind_ptr == SQL_NULL_DATA)
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

	bool OdbcStatement::get_data_timestamp_offset(const int column)
	{
		const auto& statement = *_statement;
		auto storage = make_shared<DatumStorage>();
		storage->ReserveTimestampOffset(1);
		SQLLEN str_len_or_ind_ptr;

		const auto ret = SQLGetData(statement, column + 1, SQL_C_DEFAULT, storage->timestampoffsetvec_ptr->data(),
		                            sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT), &str_len_or_ind_ptr);
		if (!check_odbc_error(ret)) return false;
		if (str_len_or_ind_ptr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true; // break
		}
		resultset->SetColumn(make_shared<TimestampColumn>(storage));
		return true;
	}

	bool OdbcStatement::d_timestamp_offset(const int column)
	{
		shared_ptr<IntColumn> col_val;
		if (_prepared)
		{
			auto& datum = _preparedStorage->atIndex(column);
			auto storage = datum->get_storage();
			resultset->SetColumn(make_shared<TimestampColumn>(storage));
			return true;
		}
		get_data_timestamp_offset(column);
		return true;
	}

	bool OdbcStatement::get_data_timestamp(const int column)
	{
		const auto& statement = *_statement;
		auto storage = make_shared<DatumStorage>();
		storage->ReserveTimestamp(1);
		SQLLEN str_len_or_ind_ptr;
		const auto ret = SQLGetData(statement, column + 1, SQL_C_TIMESTAMP, storage->timestampvec_ptr->data(),
		                            sizeof(TIMESTAMP_STRUCT), &str_len_or_ind_ptr);
		if (!check_odbc_error(ret)) return false;
		if (str_len_or_ind_ptr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true; // break
		}
		resultset->SetColumn(make_shared<TimestampColumn>(storage, _query->query_tz_adjustment()));
		return true;
	}

	bool OdbcStatement::d_timestamp(const int column)
	{
		shared_ptr<IntColumn> col_val;
		if (_prepared)
		{
			auto& datum = _preparedStorage->atIndex(column);
			auto storage = datum->get_storage();
			resultset->SetColumn(make_shared<TimestampColumn>(storage, _query->query_tz_adjustment()));
			return true;
		}
		get_data_timestamp(column);
		return true;
	}

	bool OdbcStatement::get_data_long(const int column)
	{
		const auto& statement = *_statement;
		auto storage = make_shared<DatumStorage>();
		storage->ReserveInt64(1);
		SQLLEN str_len_or_ind_ptr;
		const auto ret = SQLGetData(statement, column + 1, SQL_C_SLONG, storage->int64vec_ptr->data(), sizeof(int64_t),
		                            &str_len_or_ind_ptr);
		if (!check_odbc_error(ret)) return false;
		if (str_len_or_ind_ptr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}
		resultset->SetColumn(make_shared<IntColumn>(storage));
		return true;
	}

	bool OdbcStatement::d_integer(const int column)
	{
		shared_ptr<IntColumn> col_val;
		if (_prepared)
		{
			auto& datum = _preparedStorage->atIndex(column);
			auto storage = datum->get_storage();
			resultset->SetColumn(make_shared<IntColumn>(storage));
			return true;
		}
		get_data_long(column);
		return true;
	}

	bool OdbcStatement::d_string(const int column)
	{
		const auto read = try_read_string(false, column);
		return read;
	}

	bool OdbcStatement::get_data_bit(const int column)
	{
		const auto& statement = *_statement;
		auto storage = make_shared<DatumStorage>();
		storage->ReserveChars(1);
		SQLLEN str_len_or_ind_ptr;
		const auto ret = SQLGetData(statement, column + 1, SQL_C_BIT, storage->charvec_ptr->data(), sizeof(byte),
		                            &str_len_or_ind_ptr);
		if (!check_odbc_error(ret)) return false;
		if (str_len_or_ind_ptr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}
		resultset->SetColumn(make_shared<BoolColumn>(storage));
		return true;
	}

	bool OdbcStatement::d_bit(const int column)
	{
		if (_prepared)
		{
			auto& datum = _preparedStorage->atIndex(column);
			auto storage = datum->get_storage();
			resultset->SetColumn(make_shared<BoolColumn>(storage));
			return true;
		}
		get_data_bit(column);
		return true;
	}

	bool OdbcStatement::get_data_decimal(const int column)
	{
		const auto& statement = *_statement;
		auto storage = make_shared<DatumStorage>();
		storage->ReserveDouble(1);
		SQLLEN str_len_or_ind_ptr;
		const auto ret = SQLGetData(statement, column + 1, SQL_C_DOUBLE, storage->doublevec_ptr->data(), sizeof(double),
		                            &str_len_or_ind_ptr);
		if (!check_odbc_error(ret)) return false;
		if (str_len_or_ind_ptr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}
		resultset->SetColumn(make_shared<NumberColumn>(storage));
		return true;
	}

	bool OdbcStatement::d_decimal(const int column)
	{
		if (_prepared)
		{
			auto& datum = _preparedStorage->atIndex(column);
			auto storage = datum->get_storage();
			resultset->SetColumn(make_shared<NumberColumn>(storage));
			return true;
		}
		return get_data_decimal(column);
	}

	bool OdbcStatement::get_data_binary(const int column)
	{
		const auto& statement = *_statement;
		auto storage = make_shared<DatumStorage>();
		SQLLEN amount = 2048;
		storage->ReserveChars(amount);
		SQLLEN str_len_or_ind_ptr;
		auto more = false;
		auto ret = SQLGetData(statement, column + 1, SQL_C_BINARY, storage->charvec_ptr->data(), amount, &str_len_or_ind_ptr);
		if (!check_odbc_error(ret)) return false;
		if (str_len_or_ind_ptr == SQL_NULL_DATA)
		{
			resultset->SetColumn(make_shared<NullColumn>());
			return true;
		}
		assert(str_len_or_ind_ptr != SQL_NO_TOTAL);
		// per http://msdn.microsoft.com/en-us/library/windows/desktop/ms715441(v=vs.85).aspx

		SQLWCHAR sql_state[6];
		SQLINTEGER native_error;
		SQLSMALLINT text_length;
		if (ret == SQL_SUCCESS_WITH_INFO)
		{
			ret = SQLGetDiagRec(SQL_HANDLE_STMT, statement, 1, sql_state, &native_error, nullptr, 0, &text_length);
			if (!check_odbc_error(ret)) return false;
			more = wcsncmp(sql_state, L"01004", 6) == 0;
		}

		amount = str_len_or_ind_ptr;
		if (more)
		{
			amount = storage->charvec_ptr->size();
		}

		resultset->SetColumn(make_shared<BinaryColumn>(storage, amount, more));

		return true;
	}

	bool OdbcStatement::d_binary(const int column)
	{
		if (_prepared)
		{
			auto more = false;
			auto& datum = _preparedStorage->atIndex(column);
			auto storage = datum->get_storage();
			auto& ind = datum->get_ind_vec();
			auto amount = ind[0];
			resultset->SetColumn(make_shared<BinaryColumn>(storage, amount, more));
			return true;
		}

		return get_data_binary(column);
	}

	bool OdbcStatement::try_read_column(int column)
	{
		//fprintf(stderr, "TryReadColumn %d\n", column);
		assert(column >= 0 && column < resultset->get_column_count());
		const auto& definition = resultset->get_meta_data(column);
		return dispatch(definition.dataType, column);
	}

	bool OdbcStatement::lob(SQLLEN display_size, const int column)
	{
		bool more;
		auto storage = make_shared<DatumStorage>();
		SQLLEN value_len = LOB_PACKET_SIZE + 1;
		storage->ReserveUint16(value_len);
		const auto size = sizeof(uint16_t);
		const auto& statement = *_statement;
		const auto r = SQLGetData(statement, column + 1, SQL_C_WCHAR, storage->uint16vec_ptr->data(), value_len * size,
		                          &value_len);

		//CHECK_ODBC_NO_DATA(r, statement);
		if (!check_odbc_error(r)) return false;

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

	bool OdbcStatement::reserved_string(SQLLEN display_size, const int column) const
	{
		auto& storage = _preparedStorage->atIndex(column);
		auto& ind = storage->get_ind_vec();
		const auto size = sizeof(uint16_t);
		auto value_len = ind[0];
		value_len /= size;
		const auto value = make_shared<StringColumn>(storage->get_storage(), value_len);
		resultset->SetColumn(value);
		return true;
	}

	bool OdbcStatement::bounded_string(SQLLEN display_size, const int column)
	{
		auto storage = make_shared<DatumStorage>();
		const auto size = sizeof(uint16_t);
		SQLLEN value_len = 0;

		display_size++;
		storage->ReserveUint16(display_size); // increment for null terminator

		const auto r = SQLGetData(*_statement, column + 1, SQL_C_WCHAR, storage->uint16vec_ptr->data(), display_size * size,
		                          &value_len);
		if (!check_odbc_error(r)) return false;
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
		const auto value = make_shared<StringColumn>(storage, value_len, false);
		resultset->SetColumn(value);

		return true;
	}

	bool OdbcStatement::try_read_string(bool binary, const int column)
	{
		SQLLEN display_size = 0;

		const auto r = SQLColAttribute(*_statement, column + 1, SQL_DESC_DISPLAY_SIZE, nullptr, 0, nullptr, &display_size);
		if (!check_odbc_error(r)) return false;

		// when a field type is LOB, we read a packet at time and pass that back.
		if (display_size == 0 || display_size == numeric_limits<int>::max() ||
			display_size == numeric_limits<int>::max() >> 1 ||
			static_cast<unsigned long>(display_size) == numeric_limits<unsigned long>::max() - 1)
		{
			return lob(display_size, column);
		}

		if (display_size >= 1 && display_size <= SQL_SERVER_MAX_STRING_SIZE)
		{
			return _prepared ? reserved_string(display_size, column) : bounded_string(display_size, column);
		}

		assert(false);

		return false;
	}

	bool OdbcStatement::try_read_next_result()
	{
		//fprintf(stderr, "TryReadNextResult\n");
		//fprintf(stderr, "TryReadNextResult ID = %llu\n ", getStatementId());
		const auto state = _statementState;
		if (state == STATEMENT_CANCELLED)
		{
			//fprintf(stderr, "TryReadNextResult - cancel mode.\n");
			resultset->endOfRows = true;
			_endOfResults = true;
			_statementState = STATEMENT_ERROR;
			return false;
		}

		const auto ret = SQLMoreResults(*_statement);
		switch (ret)
		{
		case SQL_NO_DATA:
			{
				//fprintf(stderr, "SQL_NO_DATA\n");
				_endOfResults = true;
				if (_prepared)
				{
					SQLCloseCursor(*_statement);
				}
				return true;
			}

		case SQL_SUCCESS_WITH_INFO:
			{
				return_odbc_error();
				auto saved_errors = error;
				const auto res = start_reading_results();
				if (res)
				{
					resultset->endOfRows = false;
				}
				else
				{
					resultset->endOfRows = true;
				}
				return false;
			}
		default: ;
		}
		_endOfResults = false;
		return start_reading_results();
	}
}
