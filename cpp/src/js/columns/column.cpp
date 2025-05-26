#include <platform.h>
#include <common/odbc_common.h>
#include <js/workers/close_worker.h>

#include <utils/Logger.h>

#include <js/Connection.h>
#include <js/js_object_mapper.h>
#include <odbc/odbc_connection.h>
#include <odbc/odbc_row.h>
#include <js/columns/column_set.h>

namespace mssql {
Column::~Column() {}
}  // namespace mssql