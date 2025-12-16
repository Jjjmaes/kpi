/**
 * 统一错误处理中间件
 * 处理所有路由中的错误，统一错误响应格式
 */

/**
 * 自定义应用错误类
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // 标记为可预期的错误
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 统一错误处理中间件
 */
function errorHandler(err, req, res, next) {
  // 记录错误详情（包含请求上下文）
  const errorLog = {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userId: req.user?._id?.toString(),
    userRoles: req.user?.roles,
    currentRole: req.currentRole,
    timestamp: new Date().toISOString(),
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  };
  
  console.error('[Error Handler]', errorLog);
  
  // 如果是 AppError，使用其状态码和消息
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  
  // 生产环境不返回详细错误信息，开发环境返回完整信息
  const isDevelopment = process.env.NODE_ENV === 'development';
  const message = isDevelopment || err.isOperational
    ? err.message
    : '服务器内部错误，请稍后重试';
  
  // 构建统一格式的错误响应
  const errorResponse = {
    success: false,
    error: {
      code,
      message,
      statusCode
    }
  };
  
  // 开发环境返回堆栈信息和额外详情
  if (isDevelopment) {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = {
      url: req.url,
      method: req.method,
      userId: req.user?._id?.toString()
    };
  }
  
  res.status(statusCode).json(errorResponse);
}

/**
 * 404 错误处理
 */
function notFoundHandler(req, res, next) {
  const error = new AppError(
    `未找到资源: ${req.method} ${req.url}`,
    404,
    'NOT_FOUND'
  );
  next(error);
}

/**
 * 异步错误处理包装器
 * 自动捕获异步路由中的错误
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler
};

