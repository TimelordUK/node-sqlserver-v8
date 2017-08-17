#include <Operation.h>
#include <OperationManager.h>
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

	bool OperationManager::add(shared_ptr<Operation> operation_ptr)
	{
		lock_guard<mutex> lock(g_i_mutex);
		operation_ptr->OperationID = static_cast<int>(++_id);
		operations.insert(pair<size_t, shared_ptr<Operation>>(operation_ptr->OperationID, operation_ptr));
		operation_ptr->work.data = operation_ptr.get();

		const auto result = uv_queue_work(uv_default_loop(), &operation_ptr->work, on_background, reinterpret_cast<uv_after_work_cb>(on_foreground));
		if (result != 0)
		{
			return false;
		}
		return true;
	}

	void OperationManager::on_foreground(uv_work_t* work)
	{
		auto operation = static_cast<Operation*>(work->data);
		//fprintf(stderr, "OnForeground %llu\n ", operation->OperationID);
		operation->CompleteForeground();
		operation->mgr->check_in_operation(operation->OperationID);
	}

	void OperationManager::check_in_operation(size_t id)
	{
		lock_guard<mutex> lock(g_i_mutex);
		operations.erase(id);
	}

	void OperationManager::on_background(uv_work_t* work)
	{
		auto operation = static_cast<Operation*>(work->data);
		operation->InvokeBackground();
	}
}