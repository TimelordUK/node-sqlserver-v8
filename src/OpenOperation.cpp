#include "stdafx.h"
#include <OdbcConnection.h>
#include <OpenOperation.h>

namespace mssql
{
	OpenOperation::OpenOperation(shared_ptr<OdbcConnection> connection, const wstring& connection_string, int timeout, Handle<Object> callback,
		Handle<Object> backpointer)
		: OdbcOperation(connection, callback),
		connectionString(connection_string),
		backpointer(Isolate::GetCurrent(), backpointer),
		timeout(timeout)
	{
	}

	OpenOperation::~OpenOperation()
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
		const auto o = fact.newObject(backpointer);
		return o;
	}
}
