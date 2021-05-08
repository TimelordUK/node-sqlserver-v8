#include "stdafx.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <BoundDatum.h>
#include <BoundDatumHelper.h>
#include <BoundDatumSet.h>
#include <OdbcHandle.h>
#include <iostream>
#include <bcp.h>

#ifdef LINUX_BUILD
#include <unistd.h>
#endif

namespace mssql
{
    #ifdef WINDOWS_BUILD
    bool plugin_bcp::load(const wstring &shared_lib) {
        hinstLib = LoadLibrary(shared_lib.data());
        if (hinstLib != NULL) 
        { 
            bcp_init = (plug_bcp_init)GetProcAddress(hinstLib, "bcp_initW");
            bcp_bind = (plug_bcp_bind)GetProcAddress(hinstLib, "bcp_bind");
            bcp_sendrow = (plug_bcp_sendrow)GetProcAddress(hinstLib, "bcp_sendrow");
            bcp_done = (plug_bcp_done)GetProcAddress(hinstLib, "bcp_done");
            return true;
        }
        return false;
    }

    plugin_bcp::~plugin_bcp() {
        if (hinstLib != NULL) {
            FreeLibrary(hinstLib);
        } 
    }
    #endif

    #ifdef LINUX_BUILD
        inline RETCODE plugin_bcp::bcp_bind(HDBC p1, LPCBYTE p2, INT p3, DBINT p4, LPCBYTE p5, INT p6, INT p7, INT p8) {
            return ::bcp_bind(p1, p2, p3, p4, p5, p6, p7, p8);
        }
        inline RETCODE plugin_bcp::bcp_init(HDBC p1, LPCWSTR p2, LPCWSTR p3, LPCWSTR p4, INT p5) {
            return ::bcp_init(p1, p2, p3, p4, p5);
        } 
        inline DBINT plugin_bcp::bcp_sendrow(HDBC p1) {
            return ::bcp_sendrow(p1);
        }
        inline DBINT plugin_bcp::bcp_done(HDBC p1) {
            return ::bcp_done(p1);
        }
    #endif

    basestorage::basestorage(shared_ptr<BoundDatum> d) : 
            index(0),
            datum(d) {
    }

    struct storage_int : public basestorage {
        shared_ptr<DatumStorage::int32_vec_t> vec;
        storage_int(shared_ptr<BoundDatum> d) : basestorage(d)  {
            vec = datum->get_storage()->int32vec_ptr;
        }
        inline size_t size() { return vec->size(); }
        inline bool next() {
            auto & storage = *vec;
            if (index == storage.size()) return false;
            current = storage[index++];
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
		auto retcode = plugin.bcp_init(ch, reinterpret_cast<LPCWSTR>(vec.data()), NULL, NULL, DB_IN);
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
            auto s = make_shared<storage_int>(p);
            _storage.push_back(s);
			if (plugin.bcp_bind(ch, s->ptr(), 0, p->param_size, NULL, 0, p->sql_type, ++column) == FAIL)  
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
            if (plugin.bcp_sendrow(ch) == FAIL)  {  
         	    ch.read_errors(_errors);  
         		    return false;  
         	}
        }
        return true;
    }

    int bcp::done() {
        DBINT nRowsProcessed;
        const auto &ch = *_ch;
		if ((nRowsProcessed = plugin.bcp_done(ch)) == -1) {
			ch.read_errors(_errors);    
   			return false;  
        }
        return nRowsProcessed;
    }

    int bcp::insert() {
        #ifdef WINDOWS_BUILD
        if (!plugin.load(L"msodbcsql17.dll")) return -1;
        #endif
		if (!init()) return -1;
        if (!bind()) return -1;
        if (!send()) return -1;
        return done();
    }
}