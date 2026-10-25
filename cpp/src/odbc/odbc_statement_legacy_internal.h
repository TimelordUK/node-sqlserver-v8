#pragma once

// helpers shared by the files odbc_statement_legacy is split into

#include <cstddef>
#include <cstdint>
#include <vector>

namespace mssql {

// the driver's text for a numeric leaves out the zero before the point ("-.50"): put it back
inline void add_leading_zero(std::vector<uint16_t>& text) {
  const size_t sign = !text.empty() && text[0] == u'-' ? 1 : 0;
  if (text.size() > sign && text[sign] == u'.') {
    text.insert(text.begin() + static_cast<std::ptrdiff_t>(sign), u'0');
  }
}

}  // namespace mssql
