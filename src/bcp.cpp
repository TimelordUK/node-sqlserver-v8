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
            dll_bcp_init = (plug_bcp_init)GetProcAddress(hinstLib, "bcp_initW");
            dll_bcp_bind = (plug_bcp_bind)GetProcAddress(hinstLib, "bcp_bind");
            dll_bcp_sendrow = (plug_bcp_sendrow)GetProcAddress(hinstLib, "bcp_sendrow");
            dll_bcp_done = (plug_bcp_done)GetProcAddress(hinstLib, "bcp_done");
            return true;
        }
        return false;
    }

    inline RETCODE plugin_bcp::bcp_bind(HDBC p1, LPCBYTE p2, INT p3, DBINT p4, LPCBYTE p5, INT p6, INT p7, INT p8) {
            return (dll_bcp_bind != NULL) ?
            (dll_bcp_bind)(p1, p2, p3, p4, p5, p6, p7, p8)
            : -1;
    }

    inline RETCODE plugin_bcp::bcp_init(HDBC p1, LPCWSTR p2, LPCWSTR p3, LPCWSTR p4, INT p5) {
            return (dll_bcp_init != NULL) ?
            (dll_bcp_init)(p1, p2, p3, p4, p5)
            : -1;
    }

    inline DBINT plugin_bcp::bcp_sendrow(HDBC p1) {
            return (dll_bcp_sendrow != NULL) ?
            (dll_bcp_sendrow)(p1)
            : FAIL;
    }

    inline DBINT plugin_bcp::bcp_done(HDBC p1) {
             return (dll_bcp_done != NULL) ?
            (dll_bcp_done)(p1)
            : -1;
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
        DBINT current;
        inline LPCBYTE ptr() { return (LPCBYTE)&current; } 
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

    struct storage_varchar : public basestorage {
        shared_ptr<DatumStorage::uint16_vec_t_vec_t> vec;
        DatumStorage::uint16_t_vec_t current;
        inline LPCBYTE ptr() { return (LPCBYTE)current.data(); } 
        storage_varchar(shared_ptr<BoundDatum> d) : basestorage(d)  {
            vec = datum->get_storage()->uint16_vec_vec_ptr;
            current.reserve(d->buffer_len);
        }
        inline size_t size() { return vec->size(); }
        inline bool next() {
            auto & storage = *vec;
            if (index == storage.size()) return false;
            auto &src = *storage[index++];
            current.clear();
            copy(src.begin(), src.end(), back_inserter(current));
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

    shared_ptr<basestorage> get_storage(shared_ptr<BoundDatum> p) {
        shared_ptr<basestorage> r;
        auto storage = p->get_storage();
        if (storage->uint16_vec_vec_ptr && !storage->uint16_vec_vec_ptr->empty()) {
            r = make_shared<storage_varchar>(p);
        } else {
            r = make_shared<storage_int>(p);
        }
        return r;
    }

    bool bcp::bind() {
		int column = 0;
        const auto &ch = *_ch;
        auto& ps = *_param_set;
		for (auto itr = ps.begin(); itr != ps.end(); ++itr)
		{ 
			const auto& p = *itr;
            const auto s = get_storage(p);
            _storage.push_back(s);
            LPCBYTE terminator = (p->param_size == SQL_VARLEN_DATA) ? reinterpret_cast<LPCBYTE>(L"") : NULL;
            auto terminator_len = p->param_size == SQL_VARLEN_DATA ? sizeof(WCHAR) : 0;
            //bcp_bind(hdbc, szName, 0, SQL_VARLEN_DATA, L"",  sizeof(WCHAR), SQLNCHAR, 2)  
			if (plugin.bcp_bind(ch, s->ptr(), 0, p->param_size, terminator, terminator_len, p->sql_type, ++column) == FAIL)  
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