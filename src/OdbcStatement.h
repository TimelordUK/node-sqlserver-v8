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

#include "ResultSet.h"
#include "CriticalSection.h"

namespace mssql
{
	class BoundDatum;
	class BoundDatumSet;
	class DatumStorage;

	using namespace std;

	class OdbcStatement
	{
	public:
		OdbcStatement(long statementId, shared_ptr<OdbcConnectionHandle> c);
		virtual ~OdbcStatement();
		SQLLEN RowCount() const { return resultset != nullptr ? resultset->RowCount() : -1; }
		shared_ptr<ResultSet> GetResultSet() const
		{ return resultset; } 

		long getStatementId() const
		{ return statementId; }

		bool isPrepared() const 
		{ return prepared; }

		Local<Array> UnbindParams() const;
		Handle<Value> GetMetaValue() const;
		bool  endOfResults() const;
		Handle<Value> EndOfResults() const;
		Handle<Value> EndOfRows() const;
		Handle<Value> GetColumnValue() const;

		shared_ptr<OdbcError> LastError(void) const { return error; }

		bool TryPrepare(const wstring& query, u_int timeout);
		bool BindFetch(shared_ptr<BoundDatumSet> paramSet);
		bool TryExecuteDirect(const wstring& query, u_int timeout, shared_ptr<BoundDatumSet> paramSet);
		bool TryReadRow();
		bool TryReadColumn(int column);
		bool TryReadNextResult();

	private:

		bool getDataBinary(int column);
		bool getDataDecimal(int column);
		bool getDataBit(int column);
		bool getDataTimestamp(int column);
		bool getDataLong(int column);
		bool getDataTimestampOffset(int column);

		bool StartReadingResults();
		SQLRETURN queryTimeout(int timeout);
		bool d_Variant(int col);
		bool d_String(int col);
		bool d_Bit(int col);
		bool d_Integer(int col);
		bool d_Decimal(int col);
		bool d_Binary(int col);
		bool d_TimestampOffset(int col);
		bool d_Timestamp(int col);
		bool d_Timestamp2(int col);
		bool d_Time(int col);
		bool boundedString(SQLLEN display_size, int column);
		bool reservedString(SQLLEN display_size, int column) const;
		void applyPrecision(const BoundDatum & datum, int current_param) const;
		bool readColAttributes(ResultSet::ColumnDefinition& current, int column);
		bool readNext(int column);
		bool Lob(SQLLEN display_size, int column);
		static OdbcEnvironmentHandle environment;
		bool dispatch(SQLSMALLINT t, int column);
		bool BindParams(shared_ptr<BoundDatumSet>);
		bool TryReadString(bool binary, int column);

		bool ReturnOdbcError();
		bool CheckOdbcError(SQLRETURN ret);

		shared_ptr<OdbcConnectionHandle> connection;
		shared_ptr<OdbcStatementHandle> statement;
		CriticalSection closeCriticalSection;

		// any error that occurs when a Try* function returns false is stored here
		// and may be retrieved via the Error function below.

		shared_ptr<OdbcError> error;

		bool _endOfResults;
		long statementId;
		bool prepared;

		// set binary true if a binary Buffer should be returned instead of a JS string
	
		shared_ptr<ResultSet> resultset;
		shared_ptr<BoundDatumSet> boundParamsSet;
		shared_ptr<BoundDatumSet> preparedStorage;		
	};
}
