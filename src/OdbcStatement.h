//---------------------------------------------------------------------------------------------------------------------------------
// File: OdbcConnection.h
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

#pragma once

#include <ResultSet.h>
#include <CriticalSection.h>

namespace mssql
{
	class BoundDatum;
	class BoundDatumSet;
	class DatumStorage;
	class QueryOperationParams;


	using namespace std;

	class OdbcStatement
	{
	public:

		enum OdbcStatementState
		{
			STATEMENT_CREATED,
			STATEMENT_PREPARED,
			STATEMENT_SUBMITTED,
			STATEMENT_FETCHING,
			STATEMENT_CANCELLED,
			STATEMENT_ERROR,
			STATEMENT_CLOSED
		};

		bool created() { return  _statementState == STATEMENT_CREATED; }
		bool cancel();
		
		OdbcStatement(long statementId, shared_ptr<OdbcConnectionHandle> c);
		virtual ~OdbcStatement();
		SQLLEN RowCount() const { return resultset != nullptr ? resultset->RowCount() : -1; }
		shared_ptr<ResultSet> GetResultSet() const
		{ return resultset; } 

		long getStatementId() const
		{ return _statementId; }

		bool isPrepared() const 
		{ return _prepared; }

		Local<Array> unbind_params() const;
		Handle<Value> get_meta_value() const;
		bool  end_of_results() const;
		Handle<Value> handle_end_of_results() const;
		Handle<Value> end_of_rows() const;
		Handle<Value> get_column_value() const;
		bool set_polling(bool mode);

		shared_ptr<OdbcError> LastError(void) const
		{
			if (error) return error;
			return error2;
		}
	
		bool try_prepare(shared_ptr<QueryOperationParams> q);
		bool bind_fetch(shared_ptr<BoundDatumSet> paramSet);
		bool try_execute_direct(shared_ptr<QueryOperationParams> q, shared_ptr<BoundDatumSet> paramSet);
		void cancel_handle();
		bool try_read_row();
		bool try_read_column(int column);
		bool try_read_next_result();

	private:
		SQLRETURN poll_check(SQLRETURN ret, bool direct);
		bool get_data_binary(int column);
		bool get_data_decimal(int column);
		bool get_data_bit(int column);
		bool get_data_timestamp(int column);
		bool get_data_long(int column);
		bool get_data_timestamp_offset(int column);

		bool start_reading_results();
		SQLRETURN query_timeout(int timeout);
		bool d_variant(int col);
		bool d_string(int col);
		bool d_bit(int col);
		bool d_integer(int col);
		bool d_decimal(int col);
		bool d_binary(int col);
		bool d_timestamp_offset(int col);
		bool d_timestamp(int col);
		bool d_time(int col);
		bool bounded_string(SQLLEN display_size, int column);
		bool reserved_string(SQLLEN display_size, int column) const;
		void apply_precision(const BoundDatum & datum, int current_param) const;
		bool read_col_attributes(ResultSet::ColumnDefinition& current, int column);
		bool read_next(int column);
		bool lob(SQLLEN display_size, int column);
		static OdbcEnvironmentHandle environment;
		bool dispatch(SQLSMALLINT t, int column);
		bool bind_params(shared_ptr<BoundDatumSet>);
		bool try_read_string(bool binary, int column);

		bool return_odbc_error();
		bool check_odbc_error(SQLRETURN ret);
		
		shared_ptr<QueryOperationParams> _query;
		shared_ptr<OdbcConnectionHandle> _connection;
		shared_ptr<OdbcStatementHandle> _statement;
		//CriticalSection closeCriticalSection;

		// any error that occurs when a Try* function returns false is stored here
		// and may be retrieved via the Error function below.

		shared_ptr<OdbcError> error;
		shared_ptr<OdbcError> error2;

		bool _endOfResults;
		long _statementId;
		bool _prepared;
		bool _cancelRequested;
		bool _pollingEnabled;

		OdbcStatementState _statementState = STATEMENT_CREATED;

		// set binary true if a binary Buffer should be returned instead of a JS string
	
		shared_ptr<ResultSet> resultset;
		shared_ptr<BoundDatumSet> boundParamsSet;
		shared_ptr<BoundDatumSet> _preparedStorage;	
		
		mutex g_i_mutex;
	};
}
