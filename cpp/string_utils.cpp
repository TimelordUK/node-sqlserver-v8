#include "string_utils.h"
#include <Logger.h>

namespace mssql
{

  bool StringUtils::IsUtf8ContinuationByte(unsigned char byte)
  {
    return (byte & 0xC0) == 0x80;
  }

  int StringUtils::GetUtf8SequenceLength(unsigned char firstByte)
  {
    if ((firstByte & 0x80) == 0)
      return 1;
    if ((firstByte & 0xE0) == 0xC0)
      return 2;
    if ((firstByte & 0xF0) == 0xE0)
      return 3;
    if ((firstByte & 0xF8) == 0xF0)
      return 4;
    return -1; // Invalid UTF-8 sequence
  }

  uint32_t StringUtils::DecodeUtf8Sequence(const char *sequence, int length)
  {
    uint32_t codePoint = 0;

    switch (length)
    {
    case 1:
      codePoint = sequence[0];
      break;
    case 2:
      codePoint = ((sequence[0] & 0x1F) << 6) |
                  (sequence[1] & 0x3F);
      break;
    case 3:
      codePoint = ((sequence[0] & 0x0F) << 12) |
                  ((sequence[1] & 0x3F) << 6) |
                  (sequence[2] & 0x3F);
      break;
    case 4:
      codePoint = ((sequence[0] & 0x07) << 18) |
                  ((sequence[1] & 0x3F) << 12) |
                  ((sequence[2] & 0x3F) << 6) |
                  (sequence[3] & 0x3F);
      break;
    }

    return codePoint;
  }

  void StringUtils::EncodeUtf16(uint32_t codePoint, std::vector<uint16_t> &output)
  {
    if (codePoint <= 0xFFFF)
    {
      // BMP characters can be encoded directly
      output.push_back(static_cast<uint16_t>(codePoint));
    }
    else
    {
      // Supplementary characters need surrogate pairs
      codePoint -= 0x10000;
      output.push_back(static_cast<uint16_t>((codePoint >> 10) + 0xD800));   // High surrogate
      output.push_back(static_cast<uint16_t>((codePoint & 0x3FF) + 0xDC00)); // Low surrogate
    }
  }

  std::shared_ptr<std::vector<uint16_t>> StringUtils::Utf8ToUtf16(const std::string &utf8Str)
  {
    auto result = std::make_shared<std::vector<uint16_t>>();
    result->reserve(utf8Str.length()); // Reserve at least the same length as UTF-8

    const char *str = utf8Str.c_str();
    size_t len = utf8Str.length();
    size_t pos = 0;

    while (pos < len)
    {
      int seqLen = GetUtf8SequenceLength(static_cast<unsigned char>(str[pos]));

      if (seqLen < 1 || pos + seqLen > len)
      {
        SQL_LOG_ERROR("Invalid UTF-8 sequence detected");
        return std::make_shared<std::vector<uint16_t>>();
      }

      // Validate continuation bytes
      bool valid = true;
      for (int i = 1; i < seqLen; i++)
      {
        if (!IsUtf8ContinuationByte(static_cast<unsigned char>(str[pos + i])))
        {
          valid = false;
          break;
        }
      }

      if (!valid)
      {
        SQL_LOG_ERROR("Invalid UTF-8 continuation byte");
        return std::make_shared<std::vector<uint16_t>>();
      }

      // Decode UTF-8 sequence
      uint32_t codePoint = DecodeUtf8Sequence(str + pos, seqLen);

      // Encode as UTF-16
      EncodeUtf16(codePoint, *result);

      pos += seqLen;
    }

    return result;
  }

} // namespace mssql