#include "stdafx.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <BoundDatum.h>
#include <BoundDatumSet.h>
#include <OdbcHandle.h>
#include <iostream>
#include <bcp.h>

#ifdef LINUX_BUILD
#include <unistd.h>
#endif

namespace mssql
{
    struct storage {
        storage(shared_ptr<BoundDatum> d) : 
            index(0),
            datum(d) {
        }
        DBINT current;
        LPCBYTE ptr() { return (LPCBYTE)&current; } 
        size_t index;
        shared_ptr<BoundDatum> datum;
        int size() { return  datum->get_storage()->int32vec_ptr->size(); }
        bool next() {
            auto & storage = datum->get_storage()->int32vec_ptr;
            if (index == storage->size()) return false;
            current = (*storage)[index++];
            return true;
        }
    };

    bcp::bcp(const shared_ptr<BoundDatumSet> param_set, shared_ptr<OdbcConnectionHandle> h) : 
        _ch(h),
        _param_set(param_set)  {
            _errors = make_shared<vector<shared_ptr<OdbcError>>>();
    }

    wstring bcp::table_name() {
        auto& set = *_param_set;
        if (set.size() == 0 ) return NULL;
		const auto& first = set.atIndex(0);
		if (!first->is_bcp) return NULL; 
		const auto &table = first->get_storage()->table;
        return table;
    }

    bool bcp::init() {
        auto tn = table_name();
        if (tn.empty()) return false;
        const auto &ch = *_ch;
        auto vec = wstr2wcvec(tn);
        vec.push_back((uint16_t)0);
		auto retcode = bcp_init(ch, reinterpret_cast<LPCWSTR>(vec.data()), NULL, NULL, DB_IN);
		if ( (retcode != SUCCEED) ) {
			ch.read_errors(_errors);
			return false;
		}
        return true;
    }

    bool bcp::bind() {
		int column = 0;
        const auto &ch = *_ch;
        auto& ps = *_param_set;
		for (auto itr = ps.begin(); itr != ps.end(); ++itr)
		{ 
			const auto& p = *itr;
            auto s = make_shared<storage>(p);
            _storage.push_back(s);
			if (bcp_bind(ch, s->ptr(), 0, p->param_size, NULL, 0, p->sql_type, ++column) == FAIL)  
   			{  
				ch.read_errors(_errors);  
   				return false;  
   			}
		}
        return true;
    }

    bool bcp::send() {
        auto size = _storage[0]->size();
        const auto &ch = *_ch;
        for (int i = 0; i <size; ++i) {
            for (auto itr = _storage.begin(); itr != _storage.end(); ++itr) {
                if (!(*itr)->next()) return false;
            }
            if (bcp_sendrow(ch) == FAIL)  {  
         	    ch.read_errors(_errors);  
         		    return false;  
         	}
        }
        return true;
    }

    int bcp::done() {
        DBINT nRowsProcessed;
        const auto &ch = *_ch;
		if ((nRowsProcessed = bcp_done(ch)) == -1) {
			ch.read_errors(_errors);    
   			return false;  
        }
        return nRowsProcessed;
    }

    int bcp::insert() {
		if (!init()) return -1;
        if (!bind()) return -1;
        if (!send()) return -1;
        return done();
    }
}