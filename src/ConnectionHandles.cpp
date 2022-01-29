#include "ConnectionHandles.h"

namespace mssql {
    ConnectionHandles::ConnectionHandles(const OdbcEnvironmentHandle& env) {
        _connectionHandle = make_shared<OdbcConnectionHandle>();
        if (!_connectionHandle->alloc(env)) {
			_connectionHandle = nullptr;
		}
    }

    ConnectionHandles::~ConnectionHandles() { 
        clear();
        _connectionHandle->free(); 
		_connectionHandle = nullptr;
    }

	void ConnectionHandles::clear()
	{
		// cerr << "OdbcStatementCache - size = " << statements.size() << endl;
		vector<long> ids;
		// fprintf(stderr, "destruct OdbcStatementCache\n");

		for_each(_statementHandles.begin(), _statementHandles.end(), [&](const auto & p) {
			const shared_ptr<OdbcStatementHandle> s = (p.second);
			// std::cerr << " clear " << p.first << " p = " << this << std::endl;
            s->free();
			ids.insert(ids.begin(), p.first);
		});

		for_each(ids.begin(), ids.end(), [&](const long id) {
			// cerr << "destruct OdbcStatementCache - erase statement" << id << endl;
			_statementHandles.erase(id);
		});
	}

	shared_ptr<OdbcStatementHandle> ConnectionHandles::find(const long statement_id)
	{
		shared_ptr<OdbcStatementHandle> statement_handle = nullptr;
		const auto itr = _statementHandles.find(statement_id);
		if (itr != _statementHandles.end()) {
			statement_handle = itr->second;
		}
		return statement_handle;
	}

	shared_ptr<OdbcStatementHandle> ConnectionHandles::store(shared_ptr<OdbcStatementHandle> handle)
	{
		_statementHandles.insert(pair<long, shared_ptr<OdbcStatementHandle>>(handle->statementId, handle));
		return handle;
	}

	shared_ptr<OdbcStatementHandle> ConnectionHandles::checkout(long statement_id)
	{
		if (statement_id < 0)
		{
			//fprintf(stderr, "dont fetch id %ld\n", statementId);
			return nullptr;
		}
		auto statement = find(statement_id);
		if (statement) return statement;
		const auto handle = make_shared<OdbcStatementHandle>(statement_id);
        handle->alloc(*_connectionHandle);
		//std::cerr << " checkout " << statement_id << " p = " << this <<  endl;
		return store(handle);
	}

    void ConnectionHandles::checkin(long statementId) { 
		// std::cerr << " checkin " << statementId << " p = " << this <<  endl;
		const auto handle = find(statementId);
        if (handle == nullptr) return;
		 _statementHandles.erase(statementId);
        handle->free(); 
    }
}