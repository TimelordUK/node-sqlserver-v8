#include "stdafx.h"
#include <algorithm>
#include <BoundDatum.h>
#include <BoundDatumHelper.h>
#include <BoundDatumSet.h>
#include <OdbcHandle.h>
#include <iostream>
#include <utility>
#include <bcp.h>

#ifdef LINUX_BUILD
#include <dlfcn.h>
#include <unistd.h>
#endif

#ifdef LINUX_BUILD
#define SYN_SIG string
#define DYN_SYM dlsym
#define DYN_OPEN dlopen
#define DYN_CLOSE dlclose
#endif

#ifdef WINDOWS_BUILD
#define SYN_SIG wstring
#define DYN_SYM GetProcAddress
#define DYN_OPEN LoadLibrary
#define DYN_CLOSE FreeLibrary
#endif

namespace mssql
{
    bool plugin_bcp::load(const SYN_SIG& shared_lib, shared_ptr<vector<shared_ptr<OdbcError>>> errors) {
        #ifdef WINDOWS_BUILD
        hinstLib = DYN_OPEN(shared_lib.data());
        #endif
        #ifdef LINUX_BUILD
        hinstLib = DYN_OPEN(shared_lib.data(), RTLD_NOW);
        #endif
        if (hinstLib != nullptr)
        {
            dll_bcp_init = reinterpret_cast<plug_bcp_init>(DYN_SYM(hinstLib, "bcp_initW"));
            if (!dll_bcp_init) errors->push_back(make_shared<OdbcError>("bcp", "bcp failed to get symbol bcp_initW.", -1, 0, "", "", 0));
            dll_bcp_bind = reinterpret_cast<plug_bcp_bind>(DYN_SYM(hinstLib, "bcp_bind"));
            if (!dll_bcp_bind) errors->push_back(make_shared<OdbcError>("bcp", "bcp failed to get symbol dll_bcp_bind.", -1, 0, "", "", 0));
            dll_bcp_sendrow = reinterpret_cast<plug_bcp_sendrow>(DYN_SYM(hinstLib, "bcp_sendrow"));
            if (!dll_bcp_sendrow) errors->push_back(make_shared<OdbcError>("bcp", "bcp failed to get symbol dll_bcp_sendrow.", -1, 0, "", "", 0));
            dll_bcp_done = reinterpret_cast<plug_bcp_done>(DYN_SYM(hinstLib, "bcp_done"));
            if (!dll_bcp_done) errors->push_back(make_shared<OdbcError>("bcp", "bcp failed to get symbol dll_bcp_done.", -1, 0, "", "", 0));
            return errors->empty();
        }
        return false;
    }

    plugin_bcp::~plugin_bcp() {
        if (hinstLib != nullptr) {
            DYN_CLOSE(hinstLib);
        }
    }
	
    inline RETCODE plugin_bcp::bcp_bind(const HDBC p1, const LPCBYTE p2, const INT p3, const DBINT p4, const LPCBYTE p5, const INT p6, const INT p7, const INT p8) const {
            return (dll_bcp_bind != nullptr) ?
            (dll_bcp_bind)(p1, p2, p3, p4, p5, p6, p7, p8)
            : static_cast<RETCODE>(-1);
    }

    inline RETCODE plugin_bcp::bcp_init(HDBC const p1, const LPCWSTR p2, const LPCWSTR p3, const LPCWSTR p4, const INT p5) const {
            return (dll_bcp_init != nullptr) ?
            (dll_bcp_init)(p1, p2, p3, p4, p5)
            : static_cast<RETCODE>(-1);
    }

    inline DBINT plugin_bcp::bcp_sendrow(HDBC const p1) const {
            return (dll_bcp_sendrow != nullptr) ?
            (dll_bcp_sendrow)(p1)
            : FAIL;
    }

    inline DBINT plugin_bcp::bcp_done(HDBC const p1) const {
             return (dll_bcp_done != nullptr) ?
            (dll_bcp_done)(p1)
            : static_cast<RETCODE>(-1);
    }

    template <class T> struct storage_jagged_t final : basestorage {

        SQLLEN i_indicator;
        typedef vector<T> vec_t;
        typedef vector<shared_ptr<vec_t>> vec_vec_t; 
        vec_t current;
        const vector<shared_ptr<vec_t>>& vec;
        const vector<SQLLEN>& ind;
        LPCBYTE ptr() override { return reinterpret_cast<LPCBYTE>(current.data()); } 
        storage_jagged_t(const vec_vec_t &v, const vector<SQLLEN> & i, size_t max_len) :
        basestorage(),
        i_indicator(0),
        vec(v),
        ind(i) {
            current.reserve(max_len + sizeof(SQLLEN) / sizeof(T));
        }
        size_t size() override { return vec.size(); }
        bool next() override {
            if (index == vec.size()) return false;
            i_indicator = ind[index];
            const auto &src = *vec[index++];
            current.resize(sizeof(SQLLEN) / sizeof(T));
            auto *const ptr = reinterpret_cast<SQLLEN*>(current.data());
            *ptr = i_indicator;
            if (i_indicator != SQL_NULL_DATA) {
                copy(src.begin(), src.end(), back_inserter(current));
            }
            return true;
        }
    };

    template<class T> struct storage_value_t final : basestorage {
        SQLLEN i_indicator;
        T current;
        LPCBYTE ptr() override { return reinterpret_cast<LPCBYTE>(&i_indicator); }
        const vector<T>& vec;
        const vector<SQLLEN>& ind;
        storage_value_t(const vector<T>& v, const vector<SQLLEN> & i) 
        :
    	basestorage(),
    	i_indicator(0),
    	vec(v),
    	ind(i) {
        }
        size_t size() override { return vec.size(); }
        bool next() override  {
            if (index == vec.size()) return false;
            i_indicator = ind[index];
            if (i_indicator != SQL_NULL_DATA) {
                current = vec[index]; 
            }
            index++;
            return true;
        }
    };

    typedef storage_value_t<char> storage_char;
    typedef storage_value_t<double> storage_double;
    typedef storage_value_t<int16_t> storage_int16;
    typedef storage_value_t<int32_t> storage_int32;
    typedef storage_value_t<uint32_t> storage_uint32;
    typedef storage_value_t<int64_t> storage_int64;
    typedef storage_value_t<SQL_DATE_STRUCT> storage_date;
    typedef storage_value_t<SQL_TIMESTAMP_STRUCT> storage_timestamp;
    typedef storage_value_t<SQL_SS_TIMESTAMPOFFSET_STRUCT> storage_timestamp_offset;
    typedef storage_value_t<SQL_NUMERIC_STRUCT> storage_numeric;
    typedef storage_jagged_t<uint16_t> storage_uint16; 
    typedef storage_jagged_t<char> storage_binary; 
    typedef storage_value_t<SQL_SS_TIME2_STRUCT> storage_time2;

    bcp::bcp(const shared_ptr<BoundDatumSet> param_set, shared_ptr<OdbcConnectionHandle> h) : 
        _ch(std::move(h)),
        _param_set(param_set)  {
        _errors = make_shared<vector<shared_ptr<OdbcError>>>();
    }

    wstring bcp::table_name() const {
        auto& set = *_param_set;
        if (set.size() == 0 ) return L"";
		const auto& first = set.atIndex(0);
		if (!first->is_bcp) return L""; 
		const auto &table = first->get_storage()->table;
        return table;
    }

    bool bcp::init() {
        const auto tn = table_name();
        if (tn.empty()) return false;
        const auto &ch = *_ch;
        auto vec = wstr2wcvec(tn);
        vec.push_back(static_cast<uint16_t>(0));
		const auto retcode = plugin.bcp_init(ch, reinterpret_cast<LPCWSTR>(vec.data()), nullptr, nullptr, DB_IN);
		if ( (retcode != SUCCEED) ) {
			ch.read_errors(_errors);
			return false;
		}
        return true;
    }

    inline shared_ptr<basestorage> get_storage(shared_ptr<BoundDatum> p) {
        shared_ptr<basestorage> r = nullptr;
        const auto storage = p->get_storage();
        const auto &ind = p->get_ind_vec();

        if (storage->isDate()) {
            r = make_shared<storage_date>(*storage->datevec_ptr, ind);
        }else if (storage->isTimestamp()) {
            r = make_shared<storage_timestamp>(*storage->timestampvec_ptr, ind);
        }else if (storage->isTime2()) {
            r = make_shared<storage_time2>(*storage->time2vec_ptr, ind);
        }else if (storage->isTimestampOffset()) {
            r = make_shared<storage_timestamp_offset>(*storage->timestampoffsetvec_ptr, ind);
        }else if (storage->isNumeric()) {
            r = make_shared<storage_numeric>(*storage->numeric_ptr, ind);
        }else if (storage->isDouble()) {
            r = make_shared<storage_double>(*storage->doublevec_ptr, ind);
        }else if (storage->isCharVec()) {
            r = make_shared<storage_binary>(*storage->char_vec_vec_ptr, ind, p->buffer_len);
        }else if (storage->isInt64()) {
            r = make_shared<storage_int64>(*storage->int64vec_ptr, ind);
        }else if (storage->isInt32()) {
            r = make_shared<storage_int32>(*storage->int32vec_ptr, ind);
        }else if (storage->isUInt32()) {
            r = make_shared<storage_uint32>(*storage->uint32vec_ptr, ind);
        }else if (storage->isInt16()) {
            r = make_shared<storage_int16>(*storage->int16vec_ptr, ind);
        }else if (storage->isUint16Vec()) {
            r = make_shared<storage_uint16>(*storage->uint16_vec_vec_ptr, ind, p->buffer_len);
        }else if (storage->isChar()) {
            r = make_shared<storage_char>(*storage->charvec_ptr, ind);
        }
        return r;
    }

    bool bcp::bind() {
        const auto &ch = *_ch;
        auto& ps = *_param_set;
		for (auto itr = ps.begin(); itr != ps.end(); ++itr)
		{ 
			const auto& p = *itr;
			if (const auto s = get_storage(p)) {
                _storage.push_back(s);
                if (plugin.bcp_bind(ch, s->ptr(), s->indicator, static_cast<DBINT>(p->param_size), p->bcp_terminator, static_cast<int>(p->bcp_terminator_len), p->sql_type, static_cast<int>(p->ordinal_position)) == FAIL)  
   			    {  
				    ch.read_errors(_errors);  
   				    return false;  
   			    }
            } else {
                return false;  
            }
		}
        return true;
    }

    bool bcp::send() {
        const auto size = _storage[0]->size();
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
        DBINT n_rows_processed;
        const auto &ch = *_ch;
		if ((n_rows_processed = plugin.bcp_done(ch)) == -1) {
			ch.read_errors(_errors);
             if (_errors->empty()) {
                const string msg = "bcp failed in step `done` yet no error was returned. No rows have likely been inserted";
                _errors->push_back(make_shared<OdbcError>("bcp", msg.c_str(), -1, 0, "", "", 0));
            }
   			return false;  
        }
        return n_rows_processed;
    }

    int bcp::dynload(const SYN_SIG name) {
        _errors->clear();
        if (!plugin.load(name, _errors)) {
            if (_errors->empty()) {
                _errors->push_back(make_shared<OdbcError>("unknown", "bcp failed to dynamically load msodbcsql v17", -1, 0, "", "", 0));
            }
            return false;
        }
        return true;
    }

    int bcp::clean(const string &step) {
        if (_errors->empty()) {
            const string msg = "bcp failed in step `" + step + "`, yet no error was returned.";
            _errors->push_back(make_shared<OdbcError>("bcp", msg.c_str(), -1, 0, "", "", 0));
        }
        done();
        return -1;
    }

    int bcp::insert() {
        #ifdef WINDOWS_BUILD
        if (!dynload(L"msodbcsql17.dll")) {
            return -1;
        }
        #endif
        #ifdef LINUX_BUILD
        if (!dynload("libmsodbcsql-17.so") && !dynload("libmsodbcsql.17.dylib")) {
            return -1;
        }
        #endif
		if (!init()) {
            return clean("init");
        }
        if (!bind()) {
            return clean("bind");
        }
        if (!send()) {
            return clean("send");
        }
        return done();
    }
}