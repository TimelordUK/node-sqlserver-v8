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
#include <dlfcn.h>
#include <unistd.h>
#endif

namespace mssql
{
    #ifdef WINDOWS_BUILD
    bool plugin_bcp::load(const wstring &shared_lib, shared_ptr<vector<shared_ptr<OdbcError>>> errors) {
        hinstLib = LoadLibrary(shared_lib.data());
        if (hinstLib != NULL) 
        { 
            dll_bcp_init = (plug_bcp_init)GetProcAddress(hinstLib, "bcp_initW");
            if (!dll_bcp_init) errors->push_back(make_shared<OdbcError>("bcp", "bcp failed to get symbol bcp_initW.", -1, 0, "", "", 0));
            dll_bcp_bind = (plug_bcp_bind)GetProcAddress(hinstLib, "bcp_bind");
            if (!dll_bcp_bind) errors->push_back(make_shared<OdbcError>("bcp", "bcp failed to get symbol dll_bcp_bind.", -1, 0, "", "", 0));
            dll_bcp_sendrow = (plug_bcp_sendrow)GetProcAddress(hinstLib, "bcp_sendrow");
            if (!dll_bcp_sendrow) errors->push_back(make_shared<OdbcError>("bcp", "bcp failed to get symbol dll_bcp_sendrow.", -1, 0, "", "", 0));
            dll_bcp_done = (plug_bcp_done)GetProcAddress(hinstLib, "bcp_done");
            if (!dll_bcp_sendrow) errors->push_back(make_shared<OdbcError>("bcp", "bcp failed to get symbol dll_bcp_done.", -1, 0, "", "", 0));
            return errors->empty();
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
    bool plugin_bcp::load(const string &shared_lib, shared_ptr<vector<shared_ptr<OdbcError>>> errors, int mode = RTLD_NOW) {
        hinstLib = dlopen(shared_lib.data(), mode);
        if (hinstLib != NULL) 
        { 
            dll_bcp_init = (plug_bcp_init)dlsym(hinstLib, "bcp_initW");
            if (!dll_bcp_init) errors->push_back(make_shared<OdbcError>("bcp", "bcp failed to get symbol bcp_initW.", -1, 0, "", "", 0));
            dll_bcp_bind = (plug_bcp_bind)dlsym(hinstLib, "bcp_bind");
            if (!dll_bcp_bind) errors->push_back(make_shared<OdbcError>("bcp", "bcp failed to get symbol dll_bcp_bind.", -1, 0, "", "", 0));
            dll_bcp_sendrow = (plug_bcp_sendrow)dlsym(hinstLib, "bcp_sendrow");
            if (!dll_bcp_sendrow) errors->push_back(make_shared<OdbcError>("bcp", "bcp failed to get symbol dll_bcp_sendrow.", -1, 0, "", "", 0));
            dll_bcp_done = (plug_bcp_done)dlsym(hinstLib, "bcp_done");
            if (!dll_bcp_sendrow) errors->push_back(make_shared<OdbcError>("bcp", "bcp failed to get symbol dll_bcp_done.", -1, 0, "", "", 0));
            return errors->empty();
        }
        return false;
    }

    plugin_bcp::~plugin_bcp() {
        if (hinstLib != NULL) {
            dlclose(hinstLib);
        } 
    }

    #endif

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

/*
bcp_bind(m_hdbc, (BYTE *)buffer, 4, sizeof(TIMESTAMP_STRUCT), 0, 0, SQLDATETIME2N, index);

if (bcp_bind(hdbc, (LPCBYTE) szCompanyName, 0, SQL_VARLEN_DATA,  
   (LPCBYTE) pTerm, strnlen(pTerm, sizeof(pTerm)), SQLCHARACTER, 2) == FAIL)  
   {  
   // Raise error and return.  
   return;  
   }  
   */

    bool bcp::bind() {
		int column = 0;
        const auto &ch = *_ch;
        auto& ps = *_param_set;
		for (auto itr = ps.begin(); itr != ps.end(); ++itr)
		{ 
			const auto& p = *itr;
            const auto s = get_storage(p);
            _storage.push_back(s);
            LPCBYTE terminator = (p->param_size == static_cast<SQLULEN>(SQL_VARLEN_DATA)) ? 
                reinterpret_cast<LPCBYTE>(L"") : NULL;
            auto terminator_len = (p->param_size == static_cast<SQLULEN>(SQL_VARLEN_DATA)) ? 
                sizeof(WCHAR) : 0;
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
        for (size_t i = 0; i < size; ++i) {
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
        if (!plugin.load(L"msodbcsql17.dll", _errors)) {
            if (_errors->empty()) {
                _errors->push_back(make_shared<OdbcError>("unknown", "bcp failed to dynamically load msodbcsql17.dll", -1, 0, "", "", 0));
            }
            return -1;
        }
        #endif
        #ifdef LINUX_BUILD
        if ( !plugin.load("libmsodbcsql-17.so", _errors) && !plugin.load("libmsodbcsql-17.dylib", _errors, RTLD_LOCAL|RTLD_LAZY) ) {
             if (_errors->empty()) {
                _errors->push_back(make_shared<OdbcError>("unknown", "bcp failed to dynamically load libmsodbcsql-17.so", -1, 0, "", "", 0));
             }
             return -1;
        }
        #endif
        
		if (!init()) {
            if (_errors->empty()) {
                _errors->push_back(make_shared<OdbcError>("unknown", "bcp failed to init yet no error was returned.", -1, 0, "", "", 0));
            }
            return -1;
        }
        if (!bind()) {
            if (_errors->empty()) {
                _errors->push_back(make_shared<OdbcError>("unknown", "bcp failed to bind yet no error was returned.", -1, 0, "", "", 0));
            }
            return -1;
        }
        if (!send()) {
            if (_errors->empty()) {
                _errors->push_back(make_shared<OdbcError>("unknown", "bcp failed to send yet no error was returned.", -1, 0, "", "", 0));
            }
            return -1;
        }
        return done();
    }
}