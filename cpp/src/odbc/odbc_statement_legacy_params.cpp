#include <common/platform.h>

#include <algorithm>
#include <cstring>  // For std::memcpy
#include <common/odbc_common.h>
#include <common/string_utils.h>
#include <core/bound_datum_set.h>
#include <odbc/iodbc_api.h>
#include <odbc/odbc_driver_types.h>
#include <odbc/odbc_error_handler.h>
#include <odbc/odbc_row.h>
#include <odbc/odbc_type_mapper.h>
#include <utils/Logger.h>
#include <odbc/odbc_statement_legacy.h>
#include <js/columns/column_set.h>
#include <common/numeric_utils.h>
#include <odbc/bcp.h>
#include <js/columns/result_set.h>
#include <odbc/odbc_driver_types.h>
#include <utils/Logger.h>

namespace mssql {

size_t get_size(BoundDatumSet& params) {
  const auto f = params.begin();
  if (f == params.end())
    return 0;
  const auto p = *f;
  if (p->is_tvp) {
    // return p->param_size;
  }
  const auto size = p->get_ind_vec().size();
  return size;
}

std::shared_ptr<BoundDatumSet> OdbcStatementLegacy::Unbind() {
  return _boundParamsSet;
}

bool OdbcStatementLegacy::apply_precision(const shared_ptr<BoundDatum>& datum,
                                          const int current_param) {
  /* Modify the fields in the implicit application parameter descriptor */
  SQLHDESC hdesc = nullptr;
  const SQLINTEGER bufferLength = 0;
  auto r = _odbcApi->SQLGetStmtAttr(
      _statement->get_handle(), SQL_ATTR_APP_PARAM_DESC, &hdesc, 0, nullptr);
  if (!check_odbc_error(r)) {
    return false;
  }
  r = _odbcApi->SQLSetDescField(hdesc,
                                current_param,
                                SQL_DESC_TYPE,
                                reinterpret_cast<SQLPOINTER>(datum->c_type),
                                bufferLength);
  if (!check_odbc_error(r)) {
    return false;
  }
  r = _odbcApi->SQLSetDescField(hdesc,
                                current_param,
                                SQL_DESC_PRECISION,
                                reinterpret_cast<SQLPOINTER>(datum->param_size),
                                bufferLength);
  if (!check_odbc_error(r)) {
    return false;
  }
  r = _odbcApi->SQLSetDescField(hdesc,
                                current_param,
                                SQL_DESC_SCALE,
                                reinterpret_cast<SQLPOINTER>(datum->digits),
                                bufferLength);
  if (!check_odbc_error(r)) {
    return false;
  }
  r = _odbcApi->SQLSetDescField(hdesc,
                                current_param,
                                SQL_DESC_DATA_PTR,
                                static_cast<SQLPOINTER>(datum->buffer),
                                bufferLength);
  if (!check_odbc_error(r)) {
    return false;
  }
  return true;
}

bool OdbcStatementLegacy::bind_tvp(vector<tvp_t>& tvps) {
  if (!_statement)
    return false;
  const auto& statement = *_statement;
  for (const auto& tvp : tvps) {
    auto tvpret =
        _odbcApi->SQLSetStmtAttr(statement.get_handle(),
                                 SQL_SOPT_SS_PARAM_FOCUS,
                                 reinterpret_cast<SQLPOINTER>(static_cast<long long>(tvp.first)),
                                 SQL_IS_INTEGER);
    if (!check_odbc_error(tvpret)) {
      return false;
    }
    auto current_param = 1;
    const auto col_set = tvp.second;
    for (auto& col_itr : *col_set) {
      bind_datum(current_param, col_itr);
      current_param++;
    }
    tvpret = _odbcApi->SQLSetStmtAttr(statement.get_handle(),
                                      SQL_SOPT_SS_PARAM_FOCUS,
                                      static_cast<SQLPOINTER>(nullptr),
                                      SQL_IS_INTEGER);
    if (!check_odbc_error(tvpret)) {
      return false;
    }
  }
  return true;
}

bool OdbcStatementLegacy::bind_datum(const int current_param, const shared_ptr<BoundDatum>& datum) {
  if (!_statement) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] bind_datum: no statement");
    return false;
  }
  const auto& statement = *_statement;

  auto r = _odbcApi->SQLBindParameter(statement.get_handle(),
                                      static_cast<SQLUSMALLINT>(current_param),
                                      datum->param_type,
                                      datum->c_type,
                                      datum->sql_type,
                                      datum->param_size,
                                      datum->digits,
                                      datum->buffer,
                                      datum->buffer_len,
                                      datum->get_ind_vec().data());

  if (!check_odbc_error(r)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] bind_datum failed to bind parameter "
                             << current_param);
    return false;
  }
  /*
  if (datum->is_money) {
    auto isSmallMoney = false;
    SQLHANDLE hdesc = nullptr;
    auto moneyType = isSmallMoney
    ? (SQLPOINTER)SQL_SS_TYPE_SMALLMONEY
    : (SQLPOINTER)SQL_SS_TYPE_MONEY;

    int   x = 0;
    r = _odbcApi->SQLGetStmtAttr(statement.get_handle(), SQL_ATTR_APP_PARAM_DESC, &hdesc, 0,
  nullptr);

    r = _odbcApi->SQLGetDescField(hdesc, current_param, SQL_DESC_PRECISION, (SQLPOINTER)&x,
  sizeof(x), 0); r = _odbcApi->SQLGetDescField(hdesc, current_param, SQL_DESC_TYPE,
  (SQLPOINTER)&x, sizeof(x), 0);

    r = _odbcApi->SQLSetDescField(hdesc, current_param,
    SQL_CA_SS_SERVER_TYPE,
    SQL_SS_TYPE_DEFAULT,
    SQL_IS_INTEGER);

    _odbcApi->SQLGetStmtAttr(statement.get_handle(), SQL_ATTR_APP_PARAM_DESC, &hdesc, 0, NULL);
    _odbcApi->SQLSetDescField(hdesc, current_param, SQL_DESC_PRECISION,
  (SQLPOINTER)(datum->param_size), 0); _odbcApi->SQLSetDescField(hdesc, current_param,
  SQL_DESC_SCALE, (SQLPOINTER)(datum->digits), 0); _odbcApi->SQLSetDescField(hdesc, current_param,
  SQL_DESC_DATA_PTR, &var, 0);
  }
  */
  if (datum->get_defined_precision()) {
    if (!apply_precision(datum, current_param)) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] bind_datum failed to apply precision");
      return false;
    }
  }
  const auto name = datum->name;
  if (!name.empty()) {
    SQLINTEGER string_length = 0;
    SQLHANDLE ipd = nullptr;
    auto* const name_ptr = const_cast<wchar_t*>(name.c_str());
    r = _odbcApi->SQLGetStmtAttr(
        statement.get_handle(), SQL_ATTR_IMP_PARAM_DESC, &ipd, SQL_IS_POINTER, &string_length);
    if (!check_odbc_error(r)) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                               << "] bind_datum failed to get stmt attr SQL_ATTR_IMP_PARAM_DESC");
      return false;
    }
    r = _odbcApi->SQLSetDescField(
        ipd, current_param, SQL_DESC_NAME, name_ptr, name.size() * sizeof(wchar_t));
    if (!check_odbc_error(r)) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                               << "] bind_datum failed to set desc field SQL_DESC_NAME");
      return false;
    }
  }

  return true;
}

void OdbcStatementLegacy::queue_tvp(int current_param,
                                    param_bindings::iterator& itr,
                                    shared_ptr<BoundDatum>& datum,
                                    vector<tvp_t>& tvps) {
  if (!_statement)
    return;
  SQLHANDLE ipd = nullptr;
  const auto& statement = *_statement;
  SQLINTEGER string_length = 0;
  auto r = _odbcApi->SQLGetStmtAttr(
      statement.get_handle(), SQL_ATTR_IMP_PARAM_DESC, &ipd, SQL_IS_POINTER, &string_length);
  if (!check_odbc_error(r)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] queue_tvp failed to get stmt attr");
    return;
  }
  const auto& schema = datum->get_storage()->schema;
  if (!schema.empty()) {
    auto schema_vec = odbcstr::wstr2wcvec(schema);
    r = _odbcApi->SQLSetDescField(ipd,
                                  current_param,
                                  SQL_CA_SS_SCHEMA_NAME,
                                  reinterpret_cast<SQLPOINTER>(schema_vec.data()),
                                  schema_vec.size() * 2);
    if (!check_odbc_error(r)) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] queue_tvp failed to set desc field");
      return;
    }
  }
  tvp_t tvp;
  const auto cols = make_shared<BoundDatumSet::param_bindings>();
  for (auto c = 1; c <= datum->tvp_no_cols; ++c) {
    ++itr;
    const auto& col_datum = *itr;
    cols->push_back(col_datum);
  }
  tvps.emplace_back(current_param, cols);
}

// bind all the parameters in the array
bool OdbcStatementLegacy::bind_params(const shared_ptr<BoundDatumSet>& params) {
  if (!_statement) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] bind_params: no statement");
    return false;
  }
  auto& ps = *params;
  // fprintf(stderr, "bind_params\n");
  const auto size = get_size(ps);
  if (size <= 0)
    return true;
  const auto& statement = *_statement;
  if (size > 1) {
    const auto ret = _odbcApi->SQLSetStmtAttr(
        statement.get_handle(), SQL_ATTR_PARAMSET_SIZE, reinterpret_cast<SQLPOINTER>(size), 0);
    if (!check_odbc_error(ret)) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] bind_params failed to set stmt attr");
      return false;
    }
  }
  auto current_param = 1;

  vector<tvp_t> tvps;
  for (auto itr = ps.begin(); itr != ps.end(); ++itr) {
    auto& datum = *itr;
    if (!bind_datum(current_param, datum)) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] bind_params failed to bind datum "
                               << current_param);
      return false;
    }
    if (datum->is_tvp) {
      queue_tvp(current_param, itr, datum, tvps);
    }
    ++current_param;
  }
  bind_tvp(tvps);

  return true;
}

bool OdbcStatementLegacy::try_bcp(const shared_ptr<BoundDatumSet>& param_set, int32_t version) {
  // cerr << "bcp version " << version << endl;
  if (version == 0)
    version = 17;
  bcp b(_odbcApi, param_set, _connectionHandle);
  const auto ret = b.insert(version);
  _resultset = make_unique<ResultSet>(0);
  _resultset->_end_of_rows = true;
  _resultset->_end_of_results = true;
  _resultset->_row_count = ret;
  _errors->clear();
  SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] try_bcp: bcp errors size "
                           << b._errors->size() << " ret " << ret);
  copy(b._errors->begin(), b._errors->end(), back_inserter(*_errors));
  for (const auto& error : *_errors) {
    _errorHandler->AddError(error);
  }
  SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] try_bcp: errors size " << _errors->size());

  // If there are errors, return false to indicate failure
  if (!_errors->empty()) {
    return false;
  }

  return ret;
}
}  // namespace mssql
