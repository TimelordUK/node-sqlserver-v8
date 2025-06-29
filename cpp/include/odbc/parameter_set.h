#pragma once
#include <memory>
#include <mutex>
#include <string>
#include <vector>
#include "odbc_driver_types.h"
namespace mssql {

/**
 * @brief Collection of parameters for a query
 */
class ParameterSet {
 public:
  typedef std::vector<std::shared_ptr<SqlParameter>> qp_vec_t;

  /**
   * @brief Default constructor
   */
  ParameterSet();

  /**
   * @brief Add a parameter to the set
   * @param qp Parameter to add
   */
  void add(std::shared_ptr<SqlParameter> qp);

  /**
   * @brief Get all parameters
   * @return Vector of parameters
   */
  const qp_vec_t& getParams() const {
    return parameters_;
  }

  /**
   * @brief Create a parameter set from a JavaScript array of values
   * @param env NAPI environment
   * @param array JavaScript array of parameters
   * @return Shared pointer to ParameterSet instance
   */

 private:
  qp_vec_t parameters_;
};
}  // namespace mssql
