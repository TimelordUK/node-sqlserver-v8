#include "odbc/bcp_storage.h"

namespace mssql {
    
    std::shared_ptr<BcpStorage> createBcpStorage(const std::shared_ptr<DatumStorage>& storage,
                                                 const std::vector<SQLLEN>& indicators,
                                                 size_t buffer_len) {
        if (!storage) {
            throw std::invalid_argument("Storage cannot be null");
        }
        
        // Create a BCP storage that properly handles the iteration over the data
        class IntBcpStorage : public BcpStorage {
        private:
            std::shared_ptr<std::vector<int32_t>> values_;
            std::vector<SQLLEN> indicators_;
            int32_t current_value_ = 0;
            
        public:
            IntBcpStorage(std::shared_ptr<std::vector<int32_t>> values, 
                         const std::vector<SQLLEN>& indicators)
                : values_(values), indicators_(indicators) {}
            
            const void* ptr() override {
                return &current_value_;
            }
            
            size_t size() override {
                return values_->size();
            }
            
            bool next() override {
                if (index >= values_->size()) {
                    return false;
                }
                
                indicator_value = indicators_[index];
                if (indicator_value != SQL_NULL_DATA) {
                    current_value_ = (*values_)[index];
                }
                index++;
                return true;
            }
            
            SQLLEN* indicator() override {
                return &indicator_value;
            }
        };
        
        // Get the appropriate type vector from the storage
        switch (storage->getType()) {
            case DatumStorage::SqlType::Integer:
            {
                auto vec = storage->getTypedVector<int32_t>();
                return std::make_shared<IntBcpStorage>(vec, indicators);
            }
            default:
                throw std::runtime_error("Unsupported storage type for BCP: " + storage->getTypeName());
        }
    }
}