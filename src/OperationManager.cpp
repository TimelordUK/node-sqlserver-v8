#include "Operation.h"
#include "OperationManager.h"
#include <mutex>

namespace mssql
{
	map<size_t, shared_ptr<Operation>> OperationManager::operations;
	size_t OperationManager::_id;
	mutex g_i_mutex;

	bool OperationManager::Add(shared_ptr<Operation> operation_ptr)
	{
		lock_guard<mutex> lock(g_i_mutex);
		operation_ptr->OperationID = static_cast<int>(++_id);
		operations.insert(pair<size_t, shared_ptr<Operation>>(operation_ptr->OperationID, operation_ptr));
		operation_ptr->work.data = operation_ptr.get();

		int result = uv_queue_work(uv_default_loop(), &operation_ptr->work, OnBackground, reinterpret_cast<uv_after_work_cb>(OnForeground));
		if (result != 0)
		{
			return false;
		}
		return true;
	}

	void OperationManager::OnForeground(uv_work_t* work)
	{
		auto operation = static_cast<Operation*>(work->data);
		operation->CompleteForeground();
		if (!operation->persists) CheckinOperation(operation->OperationID);
	}

	void OperationManager::CheckinOperation(size_t id)
	{
		lock_guard<mutex> lock(g_i_mutex);
		operations.erase(id);
	}

	void OperationManager::OnBackground(uv_work_t* work)
	{
		auto operation = static_cast<Operation*>(work->data);
		operation->InvokeBackground();
	}
}