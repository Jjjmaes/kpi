/**
 * 统一错误处理工具
 * 提供统一的错误响应格式和错误代码
 * 
 * 使用方式：
 * 1. 直接返回错误：sendErrorResponse(res, ERROR_CODES.PROJECT_NOT_FOUND, '项目不存在')
 * 2. 抛出AppError：throw new AppError('项目不存在', 404, ERROR_CODES.PROJECT_NOT_FOUND)
 * 3. 使用asyncHandler包装异步路由，自动捕获错误
 */

const { AppError } = require('../middleware/errorHandler');

// 错误代码常量
const ERROR_CODES = {
  // 认证相关 (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_DISABLED: 'USER_DISABLED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  
  // 权限相关 (403)
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  ROLE_NOT_ALLOWED: 'ROLE_NOT_ALLOWED',
  
  // 资源不存在 (404)
  NOT_FOUND: 'NOT_FOUND',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  KPI_RECORD_NOT_FOUND: 'KPI_RECORD_NOT_FOUND',
  INVOICE_NOT_FOUND: 'INVOICE_NOT_FOUND',
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  
  // 请求错误 (400)
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELDS: 'MISSING_REQUIRED_FIELDS',
  INVALID_INPUT: 'INVALID_INPUT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  
  // 业务逻辑错误 (400)
  INVALID_OPERATION: 'INVALID_OPERATION',
  AMOUNT_EXCEEDED: 'AMOUNT_EXCEEDED',
  STATUS_INVALID: 'STATUS_INVALID',
  
  // 服务器错误 (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR'
};

// HTTP状态码映射
const STATUS_CODE_MAP = {
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.INVALID_TOKEN]: 401,
  [ERROR_CODES.USER_NOT_FOUND]: 401,
  [ERROR_CODES.USER_DISABLED]: 401,
  [ERROR_CODES.INVALID_CREDENTIALS]: 401,
  
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.INSUFFICIENT_PERMISSIONS]: 403,
  [ERROR_CODES.ROLE_NOT_ALLOWED]: 403,
  
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.PROJECT_NOT_FOUND]: 404,
  [ERROR_CODES.CUSTOMER_NOT_FOUND]: 404,
  [ERROR_CODES.KPI_RECORD_NOT_FOUND]: 404,
  [ERROR_CODES.INVOICE_NOT_FOUND]: 404,
  [ERROR_CODES.PAYMENT_NOT_FOUND]: 404,
  
  [ERROR_CODES.BAD_REQUEST]: 400,
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.MISSING_REQUIRED_FIELDS]: 400,
  [ERROR_CODES.INVALID_INPUT]: 400,
  [ERROR_CODES.DUPLICATE_ENTRY]: 400,
  [ERROR_CODES.INVALID_OPERATION]: 400,
  [ERROR_CODES.AMOUNT_EXCEEDED]: 400,
  [ERROR_CODES.STATUS_INVALID]: 400,
  
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.DATABASE_ERROR]: 500,
  [ERROR_CODES.EXTERNAL_SERVICE_ERROR]: 500
};

/**
 * 创建统一错误响应
 * @param {String} code - 错误代码
 * @param {String} message - 错误消息
 * @param {Number} statusCode - HTTP状态码（可选，会根据code自动推断）
 * @param {Object} details - 额外错误详情（可选）
 * @returns {Object} 统一格式的错误响应对象
 */
function createErrorResponse(code, message, statusCode = null, details = null) {
  const finalStatusCode = statusCode || STATUS_CODE_MAP[code] || 500;
  
  const errorResponse = {
    success: false,
    error: {
      code,
      message,
      statusCode: finalStatusCode
    }
  };
  
  if (details) {
    errorResponse.error.details = details;
  }
  
  return {
    statusCode: finalStatusCode,
    response: errorResponse
  };
}

/**
 * 发送统一格式的错误响应
 * @param {Object} res - Express响应对象
 * @param {String} code - 错误代码
 * @param {String} message - 错误消息
 * @param {Number} statusCode - HTTP状态码（可选）
 * @param {Object} details - 额外错误详情（可选）
 */
function sendErrorResponse(res, code, message, statusCode = null, details = null) {
  const { statusCode: finalStatusCode, response } = createErrorResponse(code, message, statusCode, details);
  return res.status(finalStatusCode).json(response);
}

/**
 * 发送成功响应
 * @param {Object} res - Express响应对象
 * @param {Object} data - 响应数据
 * @param {Number} statusCode - HTTP状态码（默认200）
 */
function sendSuccessResponse(res, data = null, statusCode = 200) {
  const response = { success: true };
  if (data !== null) {
    response.data = data;
  }
  return res.status(statusCode).json(response);
}

/**
 * 处理异步路由错误的包装器
 * @param {Function} fn - 异步路由处理函数
 * @returns {Function} 包装后的路由处理函数
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      console.error('[Error Handler]', error);
      
      // MongoDB重复键错误
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern || {})[0] || '字段';
        return sendErrorResponse(
          res,
          ERROR_CODES.DUPLICATE_ENTRY,
          `${field}已存在`,
          400
        );
      }
      
      // MongoDB验证错误
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors || {}).map(e => e.message).join(', ');
        return sendErrorResponse(
          res,
          ERROR_CODES.VALIDATION_ERROR,
          messages || '数据验证失败',
          400
        );
      }
      
      // 其他错误
      return sendErrorResponse(
        res,
        ERROR_CODES.INTERNAL_ERROR,
        error.message || '服务器内部错误',
        500
      );
    });
  };
}

// 便捷的错误抛出函数
function throwError(code, message, statusCode = null) {
  const finalStatusCode = statusCode || STATUS_CODE_MAP[code] || 500;
  throw new AppError(message, finalStatusCode, code);
}

module.exports = {
  ERROR_CODES,
  STATUS_CODE_MAP,
  createErrorResponse,
  sendErrorResponse,
  sendSuccessResponse,
  throwError,
  // 重新导出AppError以便路由文件使用
  AppError
};

