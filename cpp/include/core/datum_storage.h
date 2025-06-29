#pragma once
// undo these tokens to use numeric_limits below
#undef min
#undef max

// Include platform.h first to ensure Windows types are defined
#include <platform.h>

// Then include ODBC headers which need the Windows types
#include <common/odbc_common.h>

// Standard library includes
#include <limits>
#include <vector>
#include <string.h>
#include <memory>
#include <stdexcept>
#include <type_traits>
#include <string>
#include <iostream>
#include <sstream>
#include <iomanip>
#include <Logger.h>
#include <algorithm>

#ifdef LINUX_BUILD
#include <cmath>
#include <cfloat>
#endif

namespace mssql {

class DatumStorage {
 public:
  enum class SqlType {
    Unknown,
    TinyInt,
    SmallInt,
    Integer,
    UnsignedInt,
    BigInt,
    Real,
    Float,
    Double,
    Decimal,
    Numeric,
    Char,
    VarChar,
    Text,
    NChar,
    NVarChar,
    NText,
    Binary,
    VarBinary,
    Date,
    Time,
    DateTime,
    DateTime2,
    DateTimeOffset,
    Bit,
    Variant
  };

  typedef long long int bigint_t;
  typedef std::vector<uint16_t> uint16_t_vec_t;
  typedef std::vector<std::shared_ptr<uint16_t_vec_t>> uint16_vec_t_vec_t;
  typedef std::vector<char> char_vec_t;
  typedef std::vector<std::shared_ptr<char_vec_t>> char_vec_t_vec_t;
  typedef std::vector<int8_t> int8_vec_t;
  typedef std::vector<int16_t> int16_vec_t;
  typedef std::vector<int32_t> int32_vec_t;
  typedef std::vector<uint32_t> uint32_vec_t;
  typedef std::vector<int64_t> int64_vec_t;
  typedef std::vector<double> double_vec_t;
  typedef std::vector<bigint_t> bigint_vec_t;
  typedef std::vector<SQL_SS_TIMESTAMPOFFSET_STRUCT> timestamp_offset_vec_t;
  typedef std::vector<SQL_SS_TIME2_STRUCT> time2_struct_vec_t;
  typedef std::vector<SQL_TIMESTAMP_STRUCT> timestamp_struct_vec_t;
  typedef std::vector<SQL_DATE_STRUCT> date_struct_vec_t;
  typedef std::vector<SQL_NUMERIC_STRUCT> numeric_struct_vec_t;

  void logDebug(LogLevel level = LogLevel::Debug,
                bool showValues = true,
                size_t maxValues = 5) const {
    // Get the debug string in compact format for logs
    std::string debugStr = getDebugString(showValues, maxValues, true);

    // Log it using the Logger singleton
    Logger::GetInstance().Log(level, debugStr);
  }

  // Convenience methods for different log levels
  void logError(bool showValues = true, size_t maxValues = 5) const {
    logDebug(LogLevel::Error, showValues, maxValues);
  }

  void logWarning(bool showValues = true, size_t maxValues = 5) const {
    logDebug(LogLevel::Warning, showValues, maxValues);
  }

  void logInfo(bool showValues = true, size_t maxValues = 5) const {
    logDebug(LogLevel::Info, showValues, maxValues);
  }

  void logTrace(bool showValues = true, size_t maxValues = 5) const {
    logDebug(LogLevel::Trace, showValues, maxValues);
  }

  // Constructor with optional SQL type
  explicit DatumStorage(SqlType type = SqlType::Unknown) : sqlType(type) {}

  // Copy constructor - deleted to prevent accidental copies
  DatumStorage(const DatumStorage&) = delete;
  DatumStorage& operator=(const DatumStorage&) = delete;

  // Move constructor and assignment
  DatumStorage(DatumStorage&& other) noexcept = default;
  DatumStorage& operator=(DatumStorage&& other) noexcept = default;

  // Destructor
  ~DatumStorage() = default;

  void setType(SqlType type) {
    if (type != sqlType) {
      sqlType = type;
      vectorData = nullptr;  // Clear the vector when type changes
    }
  }

  SqlType getType() const {
    return sqlType;
  }

  size_t size() {
    auto storage = getStorage();
    if (storage) {
      return storage->size();
    }
    return 0;
  }
  bool empty() {
    auto storage = getStorage();
    if (storage) {
      return storage->empty();
    }
    return true;
  }
  void clear() {
    auto storage = getStorage();
    if (storage) {
      storage->clear();
    }
  }
  void resize(size_t s) {
    auto storage = getStorage();
    if (storage) {
      storage->resize(s);
    }
  }
  size_t capacity() {
    auto storage = getStorage();
    if (storage) {
      return storage->capacity();
    }
    return 0;
  }

  std::string getTypeName() const {
    switch (sqlType) {
      case SqlType::TinyInt:
        return "TinyInt";
      case SqlType::SmallInt:
        return "SmallInt";
      case SqlType::Integer:
        return "Integer";
      case SqlType::UnsignedInt:
        return "UnsignedInt";
      case SqlType::BigInt:
        return "BigInt";
      case SqlType::Real:
        return "Real";
      case SqlType::Float:
        return "Float";
      case SqlType::Double:
        return "Double";
      case SqlType::Decimal:
        return "Decimal";
      case SqlType::Numeric:
        return "Numeric";
      case SqlType::Char:
        return "Char";
      case SqlType::VarChar:
        return "VarChar";
      case SqlType::Text:
        return "Text";
      case SqlType::NChar:
        return "NChar";
      case SqlType::NVarChar:
        return "NVarChar";
      case SqlType::NText:
        return "NText";
      case SqlType::Binary:
        return "Binary";
      case SqlType::VarBinary:
        return "VarBinary";
      case SqlType::Date:
        return "Date";
      case SqlType::Time:
        return "Time";
      case SqlType::DateTime:
        return "DateTime";
      case SqlType::DateTime2:
        return "DateTime2";
      case SqlType::DateTimeOffset:
        return "DateTimeOffset";
      case SqlType::Bit:
        return "Bit";
      case SqlType::Variant:
        return "Variant";
      default:
        return "Unknown";
    }
  }

  static SqlType getTypeFromName(const std::string& typeName) {
    // Convert to uppercase for case-insensitive comparison
    std::string upperTypeName = typeName;
    std::transform(upperTypeName.begin(), upperTypeName.end(), upperTypeName.begin(), ::toupper);

    if (upperTypeName == "TINYINT")
      return SqlType::TinyInt;
    if (upperTypeName == "SMALLINT")
      return SqlType::SmallInt;
    if (upperTypeName == "INTEGER" || upperTypeName == "INT")
      return SqlType::Integer;
    if (upperTypeName == "UNSIGNEDINT" || upperTypeName == "UINT")
      return SqlType::UnsignedInt;
    if (upperTypeName == "BIGINT")
      return SqlType::BigInt;
    if (upperTypeName == "REAL")
      return SqlType::Real;
    if (upperTypeName == "FLOAT")
      return SqlType::Float;
    if (upperTypeName == "DOUBLE")
      return SqlType::Double;
    if (upperTypeName == "DECIMAL")
      return SqlType::Decimal;
    if (upperTypeName == "NUMERIC")
      return SqlType::Numeric;
    if (upperTypeName == "CHAR")
      return SqlType::Char;
    if (upperTypeName == "VARCHAR")
      return SqlType::VarChar;
    if (upperTypeName == "TEXT")
      return SqlType::Text;
    if (upperTypeName == "NCHAR")
      return SqlType::NChar;
    if (upperTypeName == "NVARCHAR")
      return SqlType::NVarChar;
    if (upperTypeName == "NTEXT")
      return SqlType::NText;
    if (upperTypeName == "BINARY")
      return SqlType::Binary;
    if (upperTypeName == "VARBINARY")
      return SqlType::VarBinary;
    if (upperTypeName == "DATE")
      return SqlType::Date;
    if (upperTypeName == "TIME")
      return SqlType::Time;
    if (upperTypeName == "DATETIME")
      return SqlType::DateTime;
    if (upperTypeName == "DATETIME2")
      return SqlType::DateTime2;
    if (upperTypeName == "DATETIMEOFFSET")
      return SqlType::DateTimeOffset;
    if (upperTypeName == "BIT" || upperTypeName == "BOOLEAN")
      return SqlType::Bit;
    if (upperTypeName == "VARIANT")
      return SqlType::Variant;

    // Handle SQL type strings
    if (upperTypeName == "SQL_TINYINT")
      return SqlType::TinyInt;
    if (upperTypeName == "SQL_SMALLINT")
      return SqlType::SmallInt;
    if (upperTypeName == "SQL_INTEGER")
      return SqlType::Integer;
    if (upperTypeName == "SQL_BIGINT")
      return SqlType::BigInt;
    if (upperTypeName == "SQL_REAL")
      return SqlType::Real;
    if (upperTypeName == "SQL_FLOAT" || upperTypeName == "SQL_DOUBLE")
      return SqlType::Double;
    if (upperTypeName == "SQL_DECIMAL" || upperTypeName == "SQL_NUMERIC")
      return SqlType::Decimal;
    if (upperTypeName == "SQL_CHAR")
      return SqlType::Char;
    if (upperTypeName == "SQL_VARCHAR")
      return SqlType::VarChar;
    if (upperTypeName == "SQL_LONGVARCHAR")
      return SqlType::Text;
    if (upperTypeName == "SQL_WCHAR")
      return SqlType::NChar;
    if (upperTypeName == "SQL_WVARCHAR")
      return SqlType::NVarChar;
    if (upperTypeName == "SQL_WLONGVARCHAR")
      return SqlType::NText;
    if (upperTypeName == "SQL_BINARY")
      return SqlType::Binary;
    if (upperTypeName == "SQL_VARBINARY")
      return SqlType::VarBinary;
    if (upperTypeName == "SQL_LONGVARBINARY")
      return SqlType::VarBinary;
    if (upperTypeName == "SQL_TYPE_DATE")
      return SqlType::Date;
    if (upperTypeName == "SQL_TYPE_TIME")
      return SqlType::Time;
    if (upperTypeName == "SQL_TYPE_TIMESTAMP")
      return SqlType::DateTime;
    if (upperTypeName == "SQL_SS_TIME2")
      return SqlType::Time;
    if (upperTypeName == "SQL_SS_TIMESTAMPOFFSET")
      return SqlType::DateTimeOffset;
    if (upperTypeName == "SQL_BIT")
      return SqlType::Bit;

    // For any other types, return Unknown
    return SqlType::Unknown;
  }

  // Base interface for vector operations
  class VectorBase {
   public:
    virtual ~VectorBase() = default;
    virtual size_t size() const = 0;
    virtual size_t capacity() const = 0;
    virtual void reserve(size_t size) = 0;
    virtual void resize(size_t size) = 0;
    virtual void clear() = 0;
    virtual void* data() = 0;
    virtual const void* data() const = 0;
    virtual size_t element_size() const = 0;
    virtual bool empty() const = 0;
  };

  // Templated implementation of the interface
  template <typename T>
  class VectorImpl : public VectorBase {
   public:
    VectorImpl(std::shared_ptr<std::vector<T>> vec) : vector(vec) {
      if (!vector)
        vector = std::make_shared<std::vector<T>>();
    }

    size_t size() const override {
      return vector->size();
    }
    size_t capacity() const override {
      return vector->capacity();
    }
    void reserve(size_t size) override {
      vector->reserve(size);
    }
    void resize(size_t size) override {
      vector->resize(size);
    }
    void clear() override {
      vector->clear();
    }
    void* data() override {
      return vector->data();
    }
    const void* data() const override {
      return vector->data();
    }
    size_t element_size() const override {
      return sizeof(T);
    }
    bool empty() const override {
      return vector->empty();
    }

    std::shared_ptr<std::vector<T>> vector;
  };

  void reserve(size_t size) {
    auto storage = getStorage();
    if (storage) {
      storage->reserve(size);
    }
  }

  // Get the storage - creates it lazily if needed
  std::shared_ptr<VectorBase> getStorage() {
    if (!vectorData) {
      createVectorForCurrentType();
    }
    return vectorData;
  }

  template <typename T>
  inline std::shared_ptr<std::vector<T>> reserve_vec(std::shared_ptr<std::vector<T>> existing,
                                                     size_t size) {
    if (existing == nullptr) {
      existing = std::make_shared<std::vector<T>>(size);
    } else {
      if (size > existing->capacity()) {
        existing->reserve(size);
      }
    }
    return existing;
  }

  // Type-specific operations need adjustment
  template <typename T>
  void addValue(const T& value) {
    if (!isCompatibleType<T>()) {
      throw std::runtime_error("Type mismatch - attempting to add incompatible value type");
    }

    auto typedVector = getTypedVector<T>();
    typedVector->push_back(value);
  }

  template <typename T>
  T getValue(size_t index) const {
    if (!isCompatibleType<T>()) {
      throw std::runtime_error("Type mismatch - attempting to get incompatible value type");
    }

    auto typedVector = const_cast<DatumStorage*>(this)->getTypedVector<T>();
    if (index >= typedVector->size()) {
      throw std::out_of_range("Index out of range");
    }
    return (*typedVector)[index];
  }

  template <typename T>
  std::shared_ptr<std::vector<T>> getTypedVector() {
    if (!vectorData) {
      createVectorForCurrentType();
    }

    if (!vectorData) {
      throw std::runtime_error("Failed to create vector for SQL type");
    }

    // Use a simpler approach based on the SQL type
    if (isCompatibleType<T>()) {
      switch (sqlType) {
        case SqlType::TinyInt:
          if constexpr (std::is_same_v<T, int8_t>)
            return static_cast<VectorImpl<int8_t>*>(vectorData.get())->vector;
          break;

        case SqlType::SmallInt:
          if constexpr (std::is_same_v<T, int16_t>)
            return static_cast<VectorImpl<int16_t>*>(vectorData.get())->vector;
          break;

        case SqlType::Integer:
          if constexpr (std::is_same_v<T, int32_t> || std::is_same_v<T, int>)
            return static_cast<VectorImpl<int32_t>*>(vectorData.get())->vector;
          break;

        case SqlType::UnsignedInt:
          if constexpr (std::is_same_v<T, uint32_t> || std::is_same_v<T, unsigned int>)
            return static_cast<VectorImpl<uint32_t>*>(vectorData.get())->vector;
          break;

        case SqlType::BigInt:
          // Determine at compile time which exact type is used
          if constexpr (std::is_same_v<T, int64_t>) {
            auto impl = static_cast<VectorImpl<int64_t>*>(vectorData.get());
            if (!impl) {
              Logger::GetInstance().Log(
                  LogLevel::Error,
                  "DatumStorage::getTypedVector: nullptr VectorImpl for int64_t BigInt");
              throw std::runtime_error("nullptr VectorImpl for int64_t BigInt");
            }
            return impl->vector;
          } else if constexpr (std::is_same_v<T, bigint_t>) {
            // We need to consider if bigint_t is actually different from int64_t on this platform
            if constexpr (std::is_same_v<bigint_t, int64_t>) {
              auto impl = static_cast<VectorImpl<int64_t>*>(vectorData.get());
              if (!impl) {
                Logger::GetInstance().Log(
                    LogLevel::Error,
                    "DatumStorage::getTypedVector: nullptr VectorImpl for bigint_t BigInt");
                throw std::runtime_error("nullptr VectorImpl for bigint_t BigInt");
              }
              return impl->vector;
            } else {
              // If they're different types (unlikely), use a proper reinterpret_cast
              auto impl = static_cast<VectorImpl<int64_t>*>(vectorData.get());
              if (!impl) {
                Logger::GetInstance().Log(
                    LogLevel::Error,
                    "DatumStorage::getTypedVector: nullptr VectorImpl for bigint_t BigInt");
                throw std::runtime_error("nullptr VectorImpl for bigint_t BigInt");
              }
              // This is a bit of a hack but should work - we're telling the compiler to treat
              // the vector<int64_t> as vector<bigint_t> which is safe if they're the same size
              return std::static_pointer_cast<std::vector<bigint_t>>(
                  std::shared_ptr<void>(impl->vector, impl->vector.get()));
            }
          }
          break;

        case SqlType::Real:
        case SqlType::Float:
        case SqlType::Double:
          if constexpr (std::is_same_v<T, double> || std::is_same_v<T, float>)
            return static_cast<VectorImpl<double>*>(vectorData.get())->vector;
          break;

        case SqlType::Decimal:
        case SqlType::Numeric:
          if constexpr (std::is_same_v<T, SQL_NUMERIC_STRUCT>)
            return static_cast<VectorImpl<SQL_NUMERIC_STRUCT>*>(vectorData.get())->vector;
          break;

        case SqlType::Char:
        case SqlType::Text:
        case SqlType::VarChar:
        case SqlType::Binary:
        case SqlType::VarBinary:
          if constexpr (std::is_same_v<T, char>)
            return static_cast<VectorImpl<char>*>(vectorData.get())->vector;
          break;

        case SqlType::NChar:
        case SqlType::NVarChar:
        case SqlType::NText:
          if constexpr (std::is_same_v<T, uint16_t> || std::is_same_v<T, wchar_t>)
            return static_cast<VectorImpl<uint16_t>*>(vectorData.get())->vector;
          break;

        case SqlType::Date:
          if constexpr (std::is_same_v<T, SQL_DATE_STRUCT>)
            return static_cast<VectorImpl<SQL_DATE_STRUCT>*>(vectorData.get())->vector;
          break;

        case SqlType::Time:
          if constexpr (std::is_same_v<T, SQL_SS_TIME2_STRUCT>)
            return static_cast<VectorImpl<SQL_SS_TIME2_STRUCT>*>(vectorData.get())->vector;
          break;

        case SqlType::DateTime:
        case SqlType::DateTime2:
          if constexpr (std::is_same_v<T, SQL_TIMESTAMP_STRUCT>)
            return static_cast<VectorImpl<SQL_TIMESTAMP_STRUCT>*>(vectorData.get())->vector;
          break;

        case SqlType::DateTimeOffset:
          if constexpr (std::is_same_v<T, SQL_SS_TIMESTAMPOFFSET_STRUCT>)
            return static_cast<VectorImpl<SQL_SS_TIMESTAMPOFFSET_STRUCT>*>(vectorData.get())
                ->vector;
          break;

        case SqlType::Bit:
          if constexpr (std::is_same_v<T, bool> || std::is_same_v<T, int8_t>)
            return static_cast<VectorImpl<int8_t>*>(vectorData.get())->vector;
          break;

        case SqlType::Variant:
          // Handle variant type - this depends on your implementation
          // You might need additional logic here depending on how you represent variants
          break;

        default:
          throw std::runtime_error("Unsupported SQL type");
      }
    }

    throw std::runtime_error("Type mismatch - vector has different type than requested");
  }

  void reset() {
    vectorData = nullptr;
    sqlType = SqlType::Unknown;
  }
  template <typename T>
  bool isCompatibleType() const {
    if constexpr (std::is_same_v<T, int8_t>)
      return sqlType == SqlType::TinyInt || sqlType == SqlType::Bit;
    else if constexpr (std::is_same_v<T, int16_t>)
      return sqlType == SqlType::SmallInt;
    else if constexpr (std::is_same_v<T, int32_t>)
      return sqlType == SqlType::Integer;
    else if constexpr (std::is_same_v<T, uint32_t>)
      return sqlType == SqlType::UnsignedInt;
    else if constexpr (std::is_same_v<T, int64_t> || std::is_same_v<T, bigint_t>)
      return sqlType == SqlType::BigInt;
    else if constexpr (std::is_same_v<T, double>)
      return sqlType == SqlType::Real || sqlType == SqlType::Float || sqlType == SqlType::Double;
    else if constexpr (std::is_same_v<T, SQL_NUMERIC_STRUCT>)
      return sqlType == SqlType::Decimal || sqlType == SqlType::Numeric;
    else if constexpr (std::is_same_v<T, char>)
      return sqlType == SqlType::Char || sqlType == SqlType::VarChar || sqlType == SqlType::Text ||
             sqlType == SqlType::Binary || sqlType == SqlType::VarBinary;
    else if constexpr (std::is_same_v<T, uint16_t>)
      return sqlType == SqlType::NChar || sqlType == SqlType::NVarChar || sqlType == SqlType::NText;
    else if constexpr (std::is_same_v<T, SQL_DATE_STRUCT>)
      return sqlType == SqlType::Date;
    else if constexpr (std::is_same_v<T, SQL_SS_TIME2_STRUCT>)
      return sqlType == SqlType::Time;
    else if constexpr (std::is_same_v<T, SQL_TIMESTAMP_STRUCT>)
      return sqlType == SqlType::DateTime || sqlType == SqlType::DateTime2;
    else if constexpr (std::is_same_v<T, SQL_SS_TIMESTAMPOFFSET_STRUCT>)
      return sqlType == SqlType::DateTimeOffset;
    else if constexpr (std::is_same_v<T, bool>)
      return sqlType == SqlType::Bit;
    else if constexpr (std::is_same_v<T, std::shared_ptr<uint16_t_vec_t>>)
      return true;  // Vector of Unicode strings
    else if constexpr (std::is_same_v<T, std::shared_ptr<char_vec_t>>)
      return true;  // Vector of ASCII strings
    return false;
  }

  void createVectorForCurrentType() {
    switch (sqlType) {
      case SqlType::TinyInt:
        vectorData = std::make_shared<VectorImpl<int8_t>>(std::make_shared<std::vector<int8_t>>());
        break;
      case SqlType::SmallInt:
        vectorData =
            std::make_shared<VectorImpl<int16_t>>(std::make_shared<std::vector<int16_t>>());
        break;
      case SqlType::Integer:
        vectorData =
            std::make_shared<VectorImpl<int32_t>>(std::make_shared<std::vector<int32_t>>());
        break;
      case SqlType::UnsignedInt:
        vectorData =
            std::make_shared<VectorImpl<uint32_t>>(std::make_shared<std::vector<uint32_t>>());
        break;
      case SqlType::BigInt:
        vectorData =
            std::make_shared<VectorImpl<int64_t>>(std::make_shared<std::vector<int64_t>>());
        break;
      case SqlType::Real:
      case SqlType::Float:
      case SqlType::Double:
        vectorData = std::make_shared<VectorImpl<double>>(std::make_shared<std::vector<double>>());
        break;
      case SqlType::Decimal:
      case SqlType::Numeric:
        vectorData = std::make_shared<VectorImpl<SQL_NUMERIC_STRUCT>>(
            std::make_shared<std::vector<SQL_NUMERIC_STRUCT>>());
        break;
      case SqlType::Char:
      case SqlType::VarChar:
      case SqlType::Text:
      case SqlType::Binary:
      case SqlType::VarBinary:
        vectorData = std::make_shared<VectorImpl<char>>(std::make_shared<std::vector<char>>());
        break;
      case SqlType::NChar:
      case SqlType::NVarChar:
      case SqlType::NText:
        vectorData =
            std::make_shared<VectorImpl<uint16_t>>(std::make_shared<std::vector<uint16_t>>());
        break;
      case SqlType::Date:
        vectorData = std::make_shared<VectorImpl<SQL_DATE_STRUCT>>(
            std::make_shared<std::vector<SQL_DATE_STRUCT>>());
        break;
      case SqlType::Time:
        vectorData = std::make_shared<VectorImpl<SQL_SS_TIME2_STRUCT>>(
            std::make_shared<std::vector<SQL_SS_TIME2_STRUCT>>());
        break;
      case SqlType::DateTime:
      case SqlType::DateTime2:
        vectorData = std::make_shared<VectorImpl<SQL_TIMESTAMP_STRUCT>>(
            std::make_shared<std::vector<SQL_TIMESTAMP_STRUCT>>());
        break;
      case SqlType::DateTimeOffset:
        vectorData = std::make_shared<VectorImpl<SQL_SS_TIMESTAMPOFFSET_STRUCT>>(
            std::make_shared<std::vector<SQL_SS_TIMESTAMPOFFSET_STRUCT>>());
        break;
      case SqlType::Bit:
        vectorData = std::make_shared<VectorImpl<int8_t>>(std::make_shared<std::vector<int8_t>>());
        break;
      default:
        // Leave as nullptr for unknown type
        break;
    }
  }

  void debugPrint(std::ostream& os = std::cout,
                  bool showValues = true,
                  size_t maxValues = 5) const {
    // Simply use the getDebugString method with verbose formatting
    os << getDebugString(showValues, maxValues, false);
  }

  std::string getDebugString(bool showValues = true,
                             size_t maxValues = 5,
                             bool compactFormat = false) const;

  /**
   * @brief Set this storage as containing a null value
   */
  void setNull(bool isNull = true) {
    isNull_ = isNull;
  }

  /**
   * @brief Check if this storage contains a null value
   * @return true if null, false otherwise
   */
  bool isNull() const {
    return isNull_;
  }

  /**
   * @brief Get a pointer to the raw buffer for ODBC operations
   * @return void* pointer to the underlying data buffer
   */
  void* getBuffer() {
    auto storage = getStorage();
    if (!storage || storage->empty()) {
      return nullptr;
    }

    // Return pointer to the first element of the vector
    return storage->data();
  }

  /**
   * @brief Get the SQL indicator value for this storage
   * @return SQL_NULL_DATA if null, SQL_NTS for string types, or actual data length
   */
  SQLLEN getIndicator() const {
    if (isNull_)
      return SQL_NULL_DATA;
    // For string types, return SQL_NTS
    switch (sqlType) {
      case SqlType::Char:
      case SqlType::VarChar:
      case SqlType::Text:
      case SqlType::NChar:
      case SqlType::NVarChar:
      case SqlType::NText:
        return SQL_NTS;
      default:
        return dataSize_;  // Return actual size for other types
    }
  }

  bool getBool() const {
    return getValueAs<int8_t>() != 0;
  }

  int16_t getInt16() const {
    return getValueAs<int16_t>();
  }

  int32_t getInt32() const {
    return getValueAs<int32_t>();
  }

  int64_t getInt64() const {
    return getValueAs<int64_t>();
  }

  double getDouble() const {
    return getValueAs<double>();
  }

  std::string getString() const {
    // Implementation depends on how strings are stored internally
    return std::string(reinterpret_cast<const char*>(data_.data()), data_.size());
  }

 private:
  std::wstring schema;
  std::wstring table;

  SqlType sqlType = SqlType::Unknown;
  // Single cached vector wrapper
  std::shared_ptr<VectorBase> vectorData;
  bool isNull_ = false;
  size_t dataSize_ = 0;  // Size of the actual data

  template <typename T>
  T getValueAs() const {
    if (data_.size() == 0)
      throw std::runtime_error("Invalid data size for type");
    return *reinterpret_cast<const T*>(data_.data());
  }

  std::vector<uint8_t> data_;  // Raw data storage
};

}  // namespace mssql