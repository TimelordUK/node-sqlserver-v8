#include <platform.h>
#include <common/odbc_common.h>
#include <common/string_utils.h>
#include <cmath>

#include <utils/Logger.h>

#include <codecvt>
#include <locale>
#include <stdexcept>
#include <cstring>
#include <common/numeric_utils.h>
#include <cfloat>
#include <algorithm>
#include <string>

namespace mssql {

int char2_int(const char input) {
  if (input >= '0' && input <= '9')
    return input - '0';
  if (input >= 'A' && input <= 'F')
    return input - 'A' + 10;
  if (input >= 'a' && input <= 'f')
    return input - 'a' + 10;
  // throw invalid_argument("Invalid input string");
  return 0;
}

// This function assumes src to be a zero terminated sanitized string with
// an even number of [0-9a-f] characters, and target to be sufficiently large

int hex2_bin(const char* src, char* target) {
  auto len = 0;
  while (*src && src[1]) {
    *target++ = static_cast<char>(char2_int(*src) * 16 + char2_int(src[1]));
    src += 2;
    ++len;
  }
  return len;
}

double round(const double val, const int dp) {
  const auto raised = pow(10, dp);
  const auto temp = val * raised;
  auto rounded = floor(temp);

  if (temp - rounded >= .5) {
    rounded = ceil(temp);
  }

  return rounded / raised;
}

std::string hexify(unsigned long long n) {
  std::string res;

  do {
    res += "0123456789ABCDEF"[n % 16];
    n >>= 4;
  } while (n);

  return std::string{res.rbegin(), res.rend()};
}

long strtohextoval(const SQL_NUMERIC_STRUCT& numeric) {
  long value = 0;
  int i = 1, last = 1;
  int a = 0, b = 0;
  for (i = 0; i <= 15; i++) {
    const int current = (int)numeric.val[i];
    a = current % 16;  // Obtain LSD
    b = current / 16;  // Obtain MSD

    value += last * a;
    last = last * 16;
    value += last * b;
    last = last * 16;
  }
  return value;
}

double NumericUtils::decode_numeric_struct(const SQL_NUMERIC_STRUCT& numeric) {
  // Call to convert the little endian mode data into numeric data.

  const auto myvalue = strtohextoval(numeric);

  // The returned value in the above code is scaled to the value specified
  // in the scale field of the numeric structure. For example 25.212 would
  // be returned as 25212. The scale in this case is 3 hence the integer
  // value needs to be divided by 1000.

  auto divisor = 1;
  if (numeric.scale > 0) {
    for (auto i = 0; i < numeric.scale; i++) {
      divisor = divisor * 10;
    }
  }

  int sign = 0;
  auto final_val = static_cast<double>(myvalue) / static_cast<double>(divisor);
  if (!numeric.sign)
    sign = -1;
  else
    sign = 1;

  final_val *= sign;
  return final_val;
}

void NumericUtils::encode_numeric_struct(const double v,
                                         const int precision,
                                         int upscale_limit,
                                         SQL_NUMERIC_STRUCT& numeric) {
  auto encode = fabs(v);
  double intpart;
  auto scale = 0;
  char hex[SQL_MAX_NUMERIC_LEN];

  // Default scale limit should be more reasonable (e.g., 6-8 digits)
  if (upscale_limit <= 0)
    upscale_limit = 8;  // Not SQL_MAX_NUMERIC_LEN (16)

  auto dmod = modf(encode, &intpart);
  // Add epsilon for floating point comparison
  while (scale < upscale_limit && dmod > DBL_EPSILON) {
    ++scale;
    encode = encode * 10;
    dmod = modf(encode, &intpart);
  }

  const auto ull = static_cast<unsigned long long>(encode);
  memset(numeric.val, 0, SQL_MAX_NUMERIC_LEN);
  memset(hex, 0, SQL_MAX_NUMERIC_LEN);
  auto ss = hexify(ull);
  if (ss.size() % 2 == 1)
    ss = "0" + ss;
  const auto len = hex2_bin(ss.c_str(), hex);
  auto j = 0;
  for (auto i = len - 1; i >= 0; --i) {
    numeric.val[j++] = hex[i];
  }

  numeric.sign = v >= 0.0 ? 1 : 0;
  numeric.precision =
      precision > 0 ? static_cast<SQLCHAR>(precision) : static_cast<SQLCHAR>(log10(encode) + 1);
  numeric.scale = static_cast<SQLSCHAR>(std::min(upscale_limit, scale));
}

}  // namespace mssql