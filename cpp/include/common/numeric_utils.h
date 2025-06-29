// numeric_utils.h
#pragma once
#include <common/platform.h>
#include <common/odbc_common.h>
#include <cstdint>
#include <cassert>
#include <cmath>
#include <limits>
#include <algorithm>

namespace mssql {

class NumericUtils {
 public:
  static void encode_numeric_struct(const double v,
                                    const int precision,
                                    int upscale_limit,
                                    SQL_NUMERIC_STRUCT& numeric);

  static double decode_numeric_struct(const SQL_NUMERIC_STRUCT& numeric);
};

}  // namespace mssql