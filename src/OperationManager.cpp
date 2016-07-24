#include "Operation.h"
#include "OperationManager.h"
#include <mutex>

namespace mssql
{
	OperationManager::OperationManager() : _id(0)
	{		
	}

	OperationManager::~OperationManager()
	{
	//	fprintf(stderr, "~OperationManager\n");
	}

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
		//fprintf(stderr, "OnForeground %llu\n ", operation->OperationID);
		operation->CompleteForeground();
		operation->mgr->CheckinOperation(operation->OperationID);
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