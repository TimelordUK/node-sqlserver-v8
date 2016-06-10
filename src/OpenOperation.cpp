#include "stdafx.h"
#include "OdbcConnection.h"
#include "OpenOperation.h"

namespace mssql
{
	OpenOperation::OpenOperation(shared_ptr<OdbcConnection> connection, const wstring& connectionString, int timeout, Handle<Object> callback,
		Handle<Object> backpointer)
		: OdbcOperation(connection, callback),
		connectionString(connectionString),
		backpointer(Isolate::GetCurrent(), backpointer),
		timeout(timeout)
	{
	}

	OpenOperation::~OpenOperation(void)
	{
		backpointer.Reset();
	}

	bool OpenOperation::TryInvokeOdbc()
	{
		return connection->TryOpen(connectionString, timeout);
	}

	Local<Value> OpenOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		auto o = fact.newObject(backpointer);
		return o;
	}
}
