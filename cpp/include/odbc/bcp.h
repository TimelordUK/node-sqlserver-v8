#pragma once
#include <platform.h>
#include <common/odbc_common.h>

#include <functional>
#include <map>
#include <memory>
#include <set>
#include <vector>

#include "odbc/odbc_handles.h"
#include "odbc/safe_handle.h"
#include "platform.h"

namespace mssql {
using namespace std;

class OdbcConnection;
class BoundDatum;
class BoundDatumSet;
class DatumStorage;
class ConnectionHandles;
class OdbcConnectionHandle;

struct plugin_bcp {
  ~plugin_bcp();
#ifdef WINDOWS_BUILD
  bool load(const wstring&, shared_ptr<vector<shared_ptr<OdbcError>>> errors);
  HINSTANCE hinstLib = NULL;
#endif
#ifdef LINUX_BUILD
#define __cdecl
  bool load(const string&, shared_ptr<vector<shared_ptr<OdbcError>>> errors);
  void* hinstLib = NULL;
#endif

  inline RETCODE bcp_bind(HDBC const,
                          const LPCBYTE,
                          const INT,
                          const DBINT,
                          const LPCBYTE,
                          const INT,
                          const INT,
                          const INT) const;
  inline RETCODE bcp_init(HDBC const, const LPCWSTR, const LPCWSTR, const LPCWSTR, const INT) const;
  inline DBINT bcp_sendrow(HDBC const) const;
  inline DBINT bcp_done(HDBC const) const;

  typedef RETCODE(__cdecl* plug_bcp_bind)(HDBC const,
                                          const LPCBYTE,
                                          const INT,
                                          const DBINT,
                                          const LPCBYTE,
                                          const INT,
                                          const INT,
                                          const INT);
  typedef RETCODE(__cdecl* plug_bcp_init)(HDBC, LPCWSTR, LPCWSTR, LPCWSTR, INT);
  typedef DBINT(__cdecl* plug_bcp_sendrow)(HDBC);
  typedef DBINT(__cdecl* plug_bcp_done)(HDBC);
  plug_bcp_bind dll_bcp_bind;
  plug_bcp_init dll_bcp_init;
  plug_bcp_sendrow dll_bcp_sendrow;
  plug_bcp_done dll_bcp_done;
};

struct basestorage {
  basestorage() : index(0), indicator(sizeof(SQLLEN)) {}
  virtual ~basestorage() {}
  virtual size_t size() = 0;
  virtual bool next() = 0;
  virtual LPCBYTE ptr() = 0;
  size_t index;
  INT indicator;
};

struct bcp {
  bcp(std::shared_ptr<IOdbcApi> odbcApiPtr,
      const shared_ptr<BoundDatumSet> param_set,
      shared_ptr<IOdbcConnectionHandle> h);
  int insert(int version = 17);
  bool init();
  bool bind();
  bool send();
#ifdef WINDOWS_BUILD
  int dynload(const wstring name);
#endif
#ifdef LINUX_BUILD
  int dynload(const string name);
#endif
  int done();
  int clean(const string& step);
  wstring table_name() const;
  shared_ptr<IOdbcConnectionHandle> _ch;
  shared_ptr<BoundDatumSet> _param_set;
  shared_ptr<vector<shared_ptr<OdbcError>>> _errors;
  shared_ptr<IOdbcApi> _odbcApi;
  vector<shared_ptr<basestorage>> _storage;
  plugin_bcp plugin;
};
}  // namespace mssql