#include "core/datum_storage.h"

namespace mssql
{
  std::string DatumStorage::getDebugString(bool showValues, size_t maxValues, bool compactFormat) const
  {
    std::ostringstream oss;

    if (compactFormat)
    {
      oss << "DatumStorage[Type=" << getTypeName();

      auto storage = const_cast<DatumStorage *>(this)->getStorage();
      if (!storage)
      {
        oss << ", Storage=nullptr]";
        return oss.str();
      }

      oss << ", Size=" << storage->size()
          << ", Capacity=" << storage->capacity()
          << ", ElemSize=" << storage->element_size()
          << ", Empty=" << (storage->empty() ? "true" : "false");

      if (showValues && storage->size() > 0)
      {
        oss << ", Values=[";

        size_t valuesToShow = std::min(storage->size(), maxValues);

        // Type-specific compact value printing
        switch (sqlType)
        {
        case SqlType::TinyInt:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<int8_t>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            if (i > 0)
              oss << ", ";
            oss << static_cast<int>(vec[i]);
          }
          break;
        }
        case SqlType::SmallInt:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<int16_t>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            if (i > 0)
              oss << ", ";
            oss << vec[i];
          }
          break;
        }
        case SqlType::Integer:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<int32_t>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            if (i > 0)
              oss << ", ";
            oss << vec[i];
          }
          break;
        }
        case SqlType::UnsignedInt:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<uint32_t>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            if (i > 0)
              oss << ", ";
            oss << vec[i];
          }
          break;
        }
        case SqlType::BigInt:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<int64_t>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            if (i > 0)
              oss << ", ";
            oss << vec[i];
          }
          break;
        }
        case SqlType::Real:
        case SqlType::Float:
        case SqlType::Double:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<double>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            if (i > 0)
              oss << ", ";
            oss << std::fixed << std::setprecision(6) << vec[i];
          }
          break;
        }
        case SqlType::Decimal:
        case SqlType::Numeric:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<SQL_NUMERIC_STRUCT>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            if (i > 0)
              oss << ", ";
            // Format the numeric value - simplified format for logs
            oss << "NUM(p:" << static_cast<int>(vec[i].precision)
                << ",s:" << static_cast<int>(vec[i].scale) << ")";
          }
          break;
        }
        case SqlType::Char:
        case SqlType::VarChar:
        case SqlType::Text:
        case SqlType::Binary:
        case SqlType::VarBinary:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<char>();
          // For binary data, show byte count and first few bytes
          oss << vec.size() << " bytes: ";
          for (size_t i = 0; i < std::min(valuesToShow * 2, vec.size()); ++i)
          {
            if (i > 0)
              oss << " ";
            oss << std::hex << std::setw(2) << std::setfill('0')
                << static_cast<int>(static_cast<unsigned char>(vec[i]));
          }
          if (vec.size() > valuesToShow * 2)
            oss << "...";
          oss << std::dec;
          break;
        }
        case SqlType::NChar:
        case SqlType::NVarChar:
        case SqlType::NText:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<uint16_t>();
          // For Unicode, show summary and limited preview
          oss << vec.size() / 2 << " chars: \"";

          // Simple preview for displayable ASCII
          for (size_t i = 0; i < std::min(valuesToShow * 4, vec.size()); ++i)
          {
            if (vec[i] >= 32 && vec[i] <= 126)
            {
              oss << static_cast<char>(vec[i]);
            }
            else if (vec[i] == 0)
            {
              // Skip null terminators
              continue;
            }
            else
            {
              oss << "\\u" << std::hex << std::setw(4) << std::setfill('0') << vec[i] << std::dec;
            }
          }

          if (vec.size() > valuesToShow * 4)
            oss << "...";
          oss << "\"";
          break;
        }
        case SqlType::Date:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<SQL_DATE_STRUCT>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            if (i > 0)
              oss << ", ";
            oss << vec[i].year << "-"
                << std::setw(2) << std::setfill('0') << vec[i].month << "-"
                << std::setw(2) << std::setfill('0') << vec[i].day;
          }
          break;
        }
        case SqlType::Time:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<SQL_SS_TIME2_STRUCT>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            if (i > 0)
              oss << ", ";
            oss << std::setw(2) << std::setfill('0') << vec[i].hour << ":"
                << std::setw(2) << std::setfill('0') << vec[i].minute << ":"
                << std::setw(2) << std::setfill('0') << vec[i].second;

            // Only show fraction if non-zero
            if (vec[i].fraction > 0)
            {
              oss << "." << vec[i].fraction;
            }
          }
          break;
        }
        case SqlType::DateTime:
        case SqlType::DateTime2:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<SQL_TIMESTAMP_STRUCT>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            if (i > 0)
              oss << ", ";
            oss << vec[i].year << "-"
                << std::setw(2) << std::setfill('0') << vec[i].month << "-"
                << std::setw(2) << std::setfill('0') << vec[i].day << " "
                << std::setw(2) << std::setfill('0') << vec[i].hour << ":"
                << std::setw(2) << std::setfill('0') << vec[i].minute << ":"
                << std::setw(2) << std::setfill('0') << vec[i].second;

            // Only show fraction if non-zero
            if (vec[i].fraction > 0)
            {
              oss << "." << vec[i].fraction;
            }
          }
          break;
        }
        case SqlType::DateTimeOffset:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<SQL_SS_TIMESTAMPOFFSET_STRUCT>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            if (i > 0)
              oss << ", ";
            oss << vec[i].year << "-"
                << std::setw(2) << std::setfill('0') << vec[i].month << "-"
                << std::setw(2) << std::setfill('0') << vec[i].day << " "
                << std::setw(2) << std::setfill('0') << vec[i].hour << ":"
                << std::setw(2) << std::setfill('0') << vec[i].minute << ":"
                << std::setw(2) << std::setfill('0') << vec[i].second;

            // Only show fraction if non-zero
            if (vec[i].fraction > 0)
            {
              oss << "." << vec[i].fraction;
            }

            // Add timezone offset
            oss << (vec[i].timezone_hour >= 0 ? "+" : "-")
                << std::setw(2) << std::setfill('0') << std::abs(vec[i].timezone_hour) << ":"
                << std::setw(2) << std::setfill('0') << vec[i].timezone_minute;
          }
          break;
        }
        case SqlType::Bit:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<int8_t>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            if (i > 0)
              oss << ", ";
            oss << (vec[i] ? "true" : "false");
          }
          break;
        }
        default:
          oss << "[no debug info available]";
          break;
        }

        if (storage->size() > maxValues)
        {
          if (valuesToShow > 0)
            oss << ", ";
          oss << "..." << (storage->size() - maxValues) << " more";
        }

        oss << "]";
      }

      oss << "]";
    }
    else
    {
      // Original verbose format for console output
      oss << "DatumStorage:" << std::endl;
      oss << "  SQL Type: " << getTypeName() << std::endl;

      auto storage = const_cast<DatumStorage *>(this)->getStorage();
      if (!storage)
      {
        oss << "  Storage: nullptr (not initialized)" << std::endl;
        return oss.str();
      }

      oss << "  Size: " << storage->size() << std::endl;
      oss << "  Capacity: " << storage->capacity() << std::endl;
      oss << "  Element size: " << storage->element_size() << " bytes" << std::endl;
      oss << "  Empty: " << (storage->empty() ? "true" : "false") << std::endl;

      if (showValues && storage->size() > 0)
      {
        oss << "  Values (up to " << maxValues << "):" << std::endl;

        size_t valuesToShow = std::min(storage->size(), maxValues);

        // Type-specific value printing
        switch (sqlType)
        {
        case SqlType::TinyInt:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<int8_t>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            oss << "    [" << i << "]: " << static_cast<int>(vec[i]) << std::endl;
          }
          break;
        }
        case SqlType::SmallInt:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<int16_t>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            oss << "    [" << i << "]: " << vec[i] << std::endl;
          }
          break;
        }
        case SqlType::Integer:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<int32_t>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            oss << "    [" << i << "]: " << vec[i] << std::endl;
          }
          break;
        }
        case SqlType::UnsignedInt:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<uint32_t>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            oss << "    [" << i << "]: " << vec[i] << std::endl;
          }
          break;
        }
        case SqlType::BigInt:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<int64_t>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            oss << "    [" << i << "]: " << vec[i] << std::endl;
          }
          break;
        }
        case SqlType::Real:
        case SqlType::Float:
        case SqlType::Double:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<double>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            oss << "    [" << i << "]: " << std::fixed << std::setprecision(6) << vec[i] << std::endl;
          }
          break;
        }
        case SqlType::Decimal:
        case SqlType::Numeric:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<SQL_NUMERIC_STRUCT>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            oss << "    [" << i << "]: Precision=" << static_cast<int>(vec[i].precision)
                << ", Scale=" << static_cast<int>(vec[i].scale)
                << ", Sign=" << static_cast<int>(vec[i].sign) << std::endl;
            oss << "      Val=0x";
            for (int j = SQL_MAX_NUMERIC_LEN - 1; j >= 0; j--)
            {
              oss << std::hex << std::setw(2) << std::setfill('0')
                  << static_cast<int>(vec[i].val[j]);
            }
            oss << std::dec << std::endl;
          }
          break;
        }
        case SqlType::Char:
        case SqlType::VarChar:
        case SqlType::Text:
        case SqlType::Binary:
        case SqlType::VarBinary:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<char>();
          oss << "    Raw bytes: ";
          for (size_t i = 0; i < std::min(valuesToShow * 4, vec.size()); ++i)
          {
            oss << "0x" << std::hex << std::setw(2) << std::setfill('0')
                << static_cast<int>(static_cast<unsigned char>(vec[i])) << " ";
          }
          oss << std::dec << std::endl;

          // Try to display as ASCII string if it seems to be text
          bool isPrintable = true;
          for (size_t i = 0; i < std::min(vec.size(), size_t(100)); ++i)
          {
            if (vec[i] != 0 && (vec[i] < 32 || vec[i] > 126))
            {
              isPrintable = false;
              break;
            }
          }

          if (isPrintable && vec.size() > 0)
          {
            oss << "    As text: \"";
            for (size_t i = 0; i < std::min(vec.size(), size_t(100)); ++i)
            {
              if (vec[i] == 0)
                break; // Stop at null terminator
              oss << vec[i];
            }
            if (vec.size() > 100)
              oss << "...";
            oss << "\"" << std::endl;
          }
          break;
        }
        case SqlType::NChar:

        case SqlType::NVarChar:
        case SqlType::NText:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<uint16_t>();
          oss << "    Unicode: ";
          // Just print the raw values, converting to proper Unicode would require more code
          for (size_t i = 0; i < std::min(valuesToShow * 2, vec.size()); ++i)
          {
            if (vec[i] >= 32 && vec[i] <= 126)
            { // ASCII printable
              oss << static_cast<char>(vec[i]);
            }
            else if (vec[i] == 0)
            {
              oss << "\\0"; // Null terminator
            }
            else
            {
              oss << "\\u" << std::hex << std::setw(4) << std::setfill('0') << vec[i];
            }
          }
          oss << std::dec << std::endl;

          // Try to display as wide string
          oss << "    As text: \"";
          for (size_t i = 0; i < std::min(vec.size(), size_t(50)); ++i)
          {
            if (vec[i] == 0)
              break; // Stop at null terminator

            if (vec[i] >= 32 && vec[i] <= 126)
            { // ASCII printable
              oss << static_cast<char>(vec[i]);
            }
            else
            {
              oss << "\\u" << std::hex << std::setw(4) << std::setfill('0') << vec[i] << std::dec;
            }
          }
          if (vec.size() > 50)
            oss << "...";
          oss << "\"" << std::endl;
          break;
        }
        case SqlType::Date:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<SQL_DATE_STRUCT>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            oss << "    [" << i << "]: " << vec[i].year << "-"
                << std::setw(2) << std::setfill('0') << vec[i].month << "-"
                << std::setw(2) << std::setfill('0') << vec[i].day << std::endl;
          }
          break;
        }
        case SqlType::Time:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<SQL_SS_TIME2_STRUCT>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            oss << "    [" << i << "]: "
                << std::setw(2) << std::setfill('0') << vec[i].hour << ":"
                << std::setw(2) << std::setfill('0') << vec[i].minute << ":"
                << std::setw(2) << std::setfill('0') << vec[i].second << "."
                << vec[i].fraction << std::endl;
          }
          break;
        }
        case SqlType::DateTime:
        case SqlType::DateTime2:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<SQL_TIMESTAMP_STRUCT>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            oss << "    [" << i << "]: " << vec[i].year << "-"
                << std::setw(2) << std::setfill('0') << vec[i].month << "-"
                << std::setw(2) << std::setfill('0') << vec[i].day << " "
                << std::setw(2) << std::setfill('0') << vec[i].hour << ":"
                << std::setw(2) << std::setfill('0') << vec[i].minute << ":"
                << std::setw(2) << std::setfill('0') << vec[i].second << "."
                << vec[i].fraction << std::endl;
          }
          break;
        }
        case SqlType::DateTimeOffset:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<SQL_SS_TIMESTAMPOFFSET_STRUCT>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            oss << "    [" << i << "]: " << vec[i].year << "-"
                << std::setw(2) << std::setfill('0') << vec[i].month << "-"
                << std::setw(2) << std::setfill('0') << vec[i].day << " "
                << std::setw(2) << std::setfill('0') << vec[i].hour << ":"
                << std::setw(2) << std::setfill('0') << vec[i].minute << ":"
                << std::setw(2) << std::setfill('0') << vec[i].second << "."
                << vec[i].fraction
                << (vec[i].timezone_hour >= 0 ? " +" : " ")
                << std::setw(2) << std::setfill('0') << vec[i].timezone_hour << ":"
                << std::setw(2) << std::setfill('0') << vec[i].timezone_minute
                << std::endl;
          }
          break;
        }
        case SqlType::Bit:
        {
          auto &vec = *const_cast<DatumStorage *>(this)->getTypedVector<int8_t>();
          for (size_t i = 0; i < valuesToShow; ++i)
          {
            oss << "    [" << i << "]: " << (vec[i] ? "true" : "false") << std::endl;
          }
          break;
        }
        default:
          oss << "    [Debug printing not implemented for this type]" << std::endl;
          break;
        }

        if (storage->size() > maxValues)
        {
          oss << "    ... and " << (storage->size() - maxValues) << " more items" << std::endl;
        }
      }
    }

    return oss.str();
  }
}
