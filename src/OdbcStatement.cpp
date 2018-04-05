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

#include <algorithm>
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
		_error(nullptr),
		_endOfResults(true),
		_statementId(static_cast<long>(statement_id)),
		_prepared(false),
		_cancelRequested(false),
		_pollingEnabled(false),
		_resultset(nullptr),
		_boundParamsSet(nullptr)
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
		_error = make_shared<OdbcError>(c_state, c_msg, native_error);
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
		for (auto& tvp : tvps)
		{
			auto tvpret = SQLSetStmtAttr(statement, SQL_SOPT_SS_PARAM_FOCUS,
			                             reinterpret_cast<SQLPOINTER>(tvp.first), SQL_IS_INTEGER);
			if (!check_odbc_error(tvpret))
			{
				return false;
			}
			auto current_param = 1;
			const auto col_set = tvp.second;
			for (auto& col_itr : *col_set)
			{
				bind_datum(current_param, col_itr);
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
		if (_boundParamsSet != nullptr)
		{
			return _boundParamsSet->unbind();
		}
		nodeTypeFactory fact;
		const auto arr = fact.new_array(0);
		return arr;
	}

	Handle<Value> OdbcStatement::get_meta_value() const
	{
		return _resultset->meta_to_value();
	}

	bool OdbcStatement::end_of_results() const
	{
		return _endOfResults;
	}

	Handle<Value> OdbcStatement::handle_end_of_results() const
	{
		nodeTypeFactory fact;
		return fact.new_boolean(_endOfResults);
	}

	Handle<Value> OdbcStatement::end_of_rows() const
	{
		nodeTypeFactory fact;
		return fact.new_boolean(_resultset->EndOfRows());
	}

	Handle<Value> OdbcStatement::get_column_values() const
	{
		//const auto start = std::clock();

		nodeTypeFactory fact;
		auto result = fact.new_object();
		if (_resultset->EndOfRows())
		{
			result->Set(fact.from_two_byte(L"end_rows"), fact.new_boolean(true));
		}

		const auto number_rows = _resultset->get_result_count();
		const auto column_count = static_cast<int>(_resultset->get_column_count());
		auto results_array = fact.new_array(number_rows);
		result->Set(fact.from_two_byte(L"data"), results_array);
		for (size_t row_id = 0; row_id < number_rows; ++row_id) {
			auto row_array = fact.new_array(column_count);
			results_array->Set(row_id, row_array);
			for (auto c = 0; c < column_count; ++c)
			{
				row_array->Set(c, _resultset->get_column(row_id, c)->ToValue());
			}
		}

		// std::cout << "Time: " << (std::clock() - start) / static_cast<double>(CLOCKS_PER_SEC / 1000) << " ms" << std::endl;

		return result;
	}

	bool OdbcStatement::return_odbc_error()
	{
		if (!_statement) return false;
		_error = _statement->read_errors();
		//fprintf(stderr, "%s\n", error->Message());
		// fprintf(stderr, "RETURN_ODBC_ERROR - free statement handle\n\n");
		return false;
	}

	bool OdbcStatement::check_odbc_error(const SQLRETURN ret)
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

		auto& current = _resultset->get_meta_data(column);
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
		_resultset = make_unique<ResultSet>(columns);

		while (column < static_cast<int>(_resultset->get_column_count()))
		{
			if (!read_next(column++))
			{
				return false;
			}
		}

		ret = SQLRowCount(statement, &_resultset->_row_count);
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
		_resultset = make_unique<ResultSet>(num_cols);

		for (auto i = 0; i < num_cols; i++)
		{
			read_next(i);
		}

		auto reserved=  _preparedStorage->reserve(_resultset);

		auto i = 0;
		for (auto& datum : *_preparedStorage)
		{
			ret = SQLBindCol(statement, i + 1, datum->c_type, datum->buffer, datum->buffer_len, datum->get_ind_vec().data());
			if (!check_odbc_error(ret)) return false;
			++i;
		}

		_resultset->_end_of_rows = true;
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

		ret = SQLRowCount(statement, &_resultset->_row_count);
		return check_odbc_error(ret);
	}

	void OdbcStatement::cancel_handle()
	{
		SQLINTEGER native_error = -1;
		auto c_state = "CANCEL";
		auto c_msg = "Error: [msnodesql] Operation canceled.";
		_error2 = make_shared<OdbcError>(c_state, c_msg, native_error);
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

		const auto c1 = ret != SQL_NO_DATA && !SQL_SUCCEEDED(ret);
		if (ret == SQL_SUCCESS_WITH_INFO || c1)
		{
			return_odbc_error();
			_boundParamsSet = param_set;
			const auto saved_errors = _error;
			const auto res = start_reading_results();
			_error = saved_errors;
			if (res)
			{
				_resultset->_end_of_rows = false;
			}
			else
			{
				_resultset = make_unique<ResultSet>(0);
				_resultset->_end_of_rows = true;
			}

			return false;
		}
		_boundParamsSet = param_set;
		return start_reading_results();
	}

	bool OdbcStatement::dispatch(const SQLSMALLINT t, const size_t row_id, const size_t column)
	{
		bool res;
		switch (t)
		{
		case SQL_SS_VARIANT:
			res = d_variant(row_id, column);
			break;

		case SQL_CHAR:
		case SQL_VARCHAR:
		case SQL_LONGVARCHAR:
		case SQL_WCHAR:
		case SQL_WVARCHAR:
		case SQL_WLONGVARCHAR:
		case SQL_SS_XML:
		case SQL_GUID:
			res = d_string(row_id, column);
			break;

		case SQL_BIT:
			res = d_bit(row_id, column);
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
			res = d_integer(row_id, column);
			break;

		case SQL_DECIMAL:
		case SQL_NUMERIC:
		case SQL_REAL:
		case SQL_FLOAT:
		case SQL_DOUBLE:
		case SQL_BIGINT:
			res = d_decimal(row_id, column);
			break;

		case SQL_BINARY:
		case SQL_VARBINARY:
		case SQL_LONGVARBINARY:
		case SQL_SS_UDT:
			res = d_binary(row_id, column);
			break;

		case SQL_SS_TIMESTAMPOFFSET:
			res = d_timestamp_offset(row_id, column);
			break;

		case SQL_TYPE_TIME:
		case SQL_SS_TIME2:
			res = d_time(row_id, column);
			break;

		case SQL_TIMESTAMP:
		case SQL_DATETIME:
		case SQL_TYPE_TIMESTAMP:
		case SQL_TYPE_DATE:
			res = d_timestamp(row_id, column);
			break;

		default:
			res = d_string(row_id, column);
			break;
		}

		return res;
	}

	bool OdbcStatement::d_variant(const size_t row_id, const size_t column)
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
		auto& definition = _resultset->get_meta_data(column);
		definition.dataType = static_cast<SQLSMALLINT>(variant_type);
		const auto res = dispatch(definition.dataType, row_id, column);
		return res;
	}

	bool OdbcStatement::d_time(const size_t row_id, const size_t column)
	{
		const auto& statement = *_statement;
		SQLLEN str_len_or_ind_ptr;
		SQL_SS_TIME2_STRUCT time;
		memset(&time, 0, sizeof(time));

		const auto ret = SQLGetData(statement, column + 1, SQL_C_DEFAULT, &time, sizeof(time), &str_len_or_ind_ptr);
		if (!check_odbc_error(ret)) return false;
		if (str_len_or_ind_ptr == SQL_NULL_DATA)
		{
			_resultset->add_column(0, make_shared<NullColumn>(column));
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

		_resultset->add_column(row_id, make_shared<TimestampColumn>(column, datetime));
		return true;
	}

	bool OdbcStatement::get_data_timestamp_offset(const size_t row_id, const size_t column)
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
			_resultset->add_column(row_id, make_shared<NullColumn>(column));
			return true; // break
		}
		_resultset->add_column(row_id, make_shared<TimestampColumn>(column, storage));
		return true;
	}

	bool OdbcStatement::d_timestamp_offset(const size_t row_id, const size_t column)
	{
		shared_ptr<IntColumn> col_val;
		if (_prepared)
		{
			auto& datum = _preparedStorage->atIndex(column);
			auto storage = datum->get_storage();
			_resultset->add_column(row_id, make_shared<TimestampColumn>(column, storage));
			return true;
		}
		get_data_timestamp_offset(row_id, column);
		return true;
	}

	bool OdbcStatement::get_data_timestamp(const size_t row_id, const size_t column)
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
			_resultset->add_column(row_id, make_shared<NullColumn>(column));
			return true; // break
		}
		_resultset->add_column(row_id, make_shared<TimestampColumn>(column, storage, _query->query_tz_adjustment()));
		return true;
	}

	bool OdbcStatement::d_timestamp(const size_t row_id, const size_t column)
	{
		shared_ptr<IntColumn> col_val;
		if (_prepared)
		{
			auto& datum = _preparedStorage->atIndex(column);
			auto storage = datum->get_storage();
			_resultset->add_column(row_id, make_shared<TimestampColumn>(column, storage, _query->query_tz_adjustment()));
			return true;
		}
		get_data_timestamp(row_id, column);
		return true;
	}

	bool OdbcStatement::get_data_long(const size_t row_id, const size_t column)
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
			_resultset->add_column(row_id, make_shared<NullColumn>(column));
			return true;
		}
		_resultset->add_column(row_id, make_shared<IntColumn>(column, storage));
		return true;
	}

	bool OdbcStatement::d_integer(const size_t row_id, const size_t column)
	{
		shared_ptr<IntColumn> col_val;
		if (_prepared)
		{
			auto& datum = _preparedStorage->atIndex(column);
			auto storage = datum->get_storage();
			_resultset->add_column(row_id, make_shared<IntColumn>(column, storage));
			return true;
		}
		get_data_long(row_id, column);
		return true;
	}

	bool OdbcStatement::d_string(const size_t row_id, const size_t column)
	{
		const auto read = try_read_string(false, row_id, column);
		return read;
	}

	bool OdbcStatement::get_data_bit(const size_t row_id, const size_t column)
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
			_resultset->add_column(row_id, make_shared<NullColumn>(column));
			return true;
		}
		_resultset->add_column(row_id, make_shared<BoolColumn>(column, storage));
		return true;
	}

	bool OdbcStatement::d_bit(const size_t row_id, const size_t column)
	{
		if (_prepared)
		{
			auto& datum = _preparedStorage->atIndex(column);
			auto storage = datum->get_storage();
			_resultset->add_column(row_id, make_shared<BoolColumn>(column, storage));
			return true;
		}
		get_data_bit(row_id, column);
		return true;
	}

	bool OdbcStatement::get_data_decimal(const size_t row_id, const size_t column)
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
			_resultset->add_column(row_id, make_shared<NullColumn>(column));
			return true;
		}
		_resultset->add_column(row_id, make_shared<NumberColumn>(column, storage));
		return true;
	}

	bool OdbcStatement::d_decimal(const size_t row_id, const size_t column)
	{
		if (_prepared)
		{
			auto& datum = _preparedStorage->atIndex(column);
			auto storage = datum->get_storage();
			_resultset->add_column(row_id, make_shared<NumberColumn>(column, storage));
			return true;
		}
		return get_data_decimal(row_id, column);
	}

	bool OdbcStatement::get_data_binary(const size_t row_id, const size_t column)
	{
		auto reading_column = true;
		auto storage = make_shared<DatumStorage>();

		const auto& statement = *_statement;
		const SQLLEN atomic_read = 24 * 1024;
		auto bytes_to_read = atomic_read;
		storage->ReserveChars(bytes_to_read + 1);
		auto & char_data = storage->charvec_ptr;
		auto write_ptr = char_data->data();
		SQLLEN total_bytes_to_read;
		auto r = SQLGetData(statement, column + 1, SQL_C_BINARY, write_ptr, bytes_to_read, &total_bytes_to_read);
		if (!check_odbc_error(r)) return false;
		if (total_bytes_to_read == SQL_NULL_DATA)
		{
			_resultset->add_column(row_id, make_shared<NullColumn>(column));
			return true; // break
		}
		auto status = false;
		auto more = check_more_read(r, status);
		if (!status)
		{
			return false;
		}
		char_data->resize(total_bytes_to_read);
		
		if (total_bytes_to_read > bytes_to_read) {
			total_bytes_to_read -= bytes_to_read;
		}
		write_ptr = char_data->data();
		write_ptr += bytes_to_read;
		while (more)
		{
			bytes_to_read = min(static_cast<SQLLEN>(atomic_read), total_bytes_to_read);
			r = SQLGetData(statement, column + 1, SQL_C_BINARY, write_ptr, bytes_to_read, &total_bytes_to_read);
			if (!check_odbc_error(r)) return false;
			more = check_more_read(r, status);
			if (!status)
			{
				return false;
			}
			write_ptr += bytes_to_read;
		}

		_resultset->add_column(row_id, make_shared<BinaryColumn>(column, storage, char_data->size(), reading_column));
		return true;
	}

	bool OdbcStatement::d_binary(const size_t row_id, const size_t column)
	{
		if (_prepared)
		{
			auto more = false;
			auto& datum = _preparedStorage->atIndex(column);
			auto storage = datum->get_storage();
			auto& ind = datum->get_ind_vec();
			auto amount = ind[0];
			_resultset->add_column(row_id, make_shared<BinaryColumn>(column, storage, amount, more));
			return true;
		}

		return get_data_binary(row_id, column);
	}

	bool OdbcStatement::try_read_columns(const size_t number_rows)
	{
		//fprintf(stderr, "TryReadColumn %d\n", column);
		_resultset->start_results();
		const auto& statement = *_statement;
		auto res = false;
		const auto row_fetches = _prepared ? 1 : number_rows;
		for (size_t row_id = 0; row_id < row_fetches; ++row_id) {
			const auto ret = SQLFetch(statement);
			if (ret == SQL_NO_DATA)
			{
				_resultset->_end_of_rows = true;
				return true;
			}
			_resultset->_end_of_rows = false;
			res = true;
			const auto column_count = static_cast<int>(_resultset->get_column_count());
			for (auto c = 0; c < column_count; ++c) {
				const auto& definition = _resultset->get_meta_data(c);
				res = dispatch(definition.dataType, row_id, c);
				if (!res) {
					break;
				}
			}
		}
		return res;
	}

	bool OdbcStatement::check_more_read(SQLRETURN r, bool & status)
	{
		const auto& statement = *_statement;
		SQLWCHAR sql_state[6];
		SQLINTEGER native_error;
		SQLSMALLINT text_length;
		auto res = false;
		if (r == SQL_SUCCESS_WITH_INFO)
		{
			r = SQLGetDiagRec(SQL_HANDLE_STMT, statement, 1, sql_state, &native_error, nullptr, 0, &text_length);
			if (!check_odbc_error(r)) {
				status = false;
				return false;
			}
			res = wcsncmp(sql_state, L"01004", 6) == 0;
		}
		status = true;
		return res;
	}

	bool OdbcStatement::lob(const size_t row_id, size_t column)
	{
		auto reading_column = true;
		auto storage = make_shared<DatumStorage>();
			
		const auto size = sizeof(uint16_t);
		const auto& statement = *_statement;	
		const SQLLEN atomic_read = 24 * 1024;
		auto bytes_to_read = atomic_read;
		storage->ReserveUint16(atomic_read / size + 1);
		auto & uint16_data = storage->uint16vec_ptr;
		auto write_ptr = uint16_data->data();
		bytes_to_read += size;	
		SQLLEN total_bytes_to_read;
		auto r = SQLGetData(statement, column + 1, SQL_C_WCHAR, write_ptr, bytes_to_read + size, &total_bytes_to_read);
		
		if (total_bytes_to_read == SQL_NULL_DATA)
		{
			_resultset->add_column(0, make_shared<NullColumn>(column));
			return true;
		}
		if (!check_odbc_error(r)) return false;
		auto status = false;
		auto more = check_more_read(r, status);
		if (!status)
		{
			return false;
		}
		const auto maxvarchar = total_bytes_to_read < 0;
		if (maxvarchar)
		{
			total_bytes_to_read = bytes_to_read * 2;
		}
		auto n_items = total_bytes_to_read / size;
		uint16_data->reserve(n_items + 1);
		uint16_data->resize(n_items);
			
		if (total_bytes_to_read > bytes_to_read) {
			total_bytes_to_read -= bytes_to_read;
		}
		write_ptr = uint16_data->data();
		write_ptr += bytes_to_read / size;
		
		auto reads = 1;
		while (more)
		{
			bytes_to_read = min(static_cast<SQLLEN>(atomic_read + size), total_bytes_to_read);
			r = SQLGetData(statement, column + 1, SQL_C_WCHAR, write_ptr, bytes_to_read + size, &total_bytes_to_read);
			++reads;
			if (total_bytes_to_read < 0)
			{
				const int previous = uint16_data->size();
				total_bytes_to_read = bytes_to_read * (reads + 1);
				n_items = total_bytes_to_read / size;
				uint16_data->reserve(n_items + 1);
				uint16_data->resize(n_items);
				write_ptr = uint16_data->data() + previous;
			}else
			{
				write_ptr += bytes_to_read / size;
			}
			if (!check_odbc_error(r)) return false;
			more = check_more_read(r, status);
			if (!status)
			{
				return false;
			}	
		}
		auto last = uint16_data->size() - 1;
		if (maxvarchar)
		{
			while ((*uint16_data)[last] == 0)
			{
				--last;
			}
			if (last < uint16_data->size() - 1) {
				uint16_data->resize(last + 1);
			}
		}
		_resultset->add_column(row_id, make_shared<StringColumn>(column, storage, uint16_data->size(), reading_column));
		return true;
	}

	bool OdbcStatement::reserved_string(SQLLEN display_size, const size_t row_id, size_t column) const
	{
		auto& storage = _preparedStorage->atIndex(column);
		auto& ind = storage->get_ind_vec();
		const auto size = sizeof(uint16_t);
		auto value_len = ind[0];
		value_len /= size;
		const auto value = make_shared<StringColumn>(column, storage->get_storage(), value_len);
		_resultset->add_column(row_id, value);
		return true;
	}

	bool OdbcStatement::bounded_string(SQLLEN display_size, const size_t row_id, size_t column)
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
			_resultset->add_column(row_id, make_shared<NullColumn>(column));
			return true;
		}

		assert(value_len % 2 == 0); // should always be even
		value_len /= size;

		assert(value_len >= 0 && value_len <= display_size - 1);
		storage->uint16vec_ptr->resize(value_len);
		const auto value = make_shared<StringColumn>(column, storage, value_len, false);
		_resultset->add_column(row_id, value);

		return true;
	}

	bool OdbcStatement::try_read_string(bool binary, const size_t row_id, const size_t column)
	{
		SQLLEN display_size = 0;

		const auto r = SQLColAttribute(*_statement, column + 1, SQL_DESC_DISPLAY_SIZE, nullptr, 0, nullptr, &display_size);
		if (!check_odbc_error(r)) return false;

		// when a field type is LOB, we read a packet at time and pass that back.
		if (display_size == 0 || display_size == numeric_limits<int>::max() ||
			display_size == numeric_limits<int>::max() >> 1 ||
			static_cast<unsigned long>(display_size) == numeric_limits<unsigned long>::max() - 1)
		{
			return lob(row_id, column);
		}

		if (display_size >= 1 && display_size <= SQL_SERVER_MAX_STRING_SIZE)
		{
			return _prepared ? reserved_string(display_size, row_id, column) : bounded_string(display_size, row_id, column);
		}

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
			_resultset->_end_of_rows = true;
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
				auto saved_errors = _error;
				const auto res = start_reading_results();
				if (res)
				{
					_resultset->_end_of_rows = false;
				}
				else
				{
					_resultset->_end_of_rows = true;
				}
				return false;
			}
		default: ;
		}
		_endOfResults = false;
		return start_reading_results();
	}
}
