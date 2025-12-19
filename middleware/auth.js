const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getPermissionSync, getDefaultRoleSync, getPermission, getDefaultRole } = require('../config/permissions');

// JWT验证中间件
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]; // Bearer token
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: {
          code: 'UNAUTHORIZED',
          message: '未提供认证令牌',
          statusCode: 401
        }
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        success: false, 
        error: {
          code: user ? 'USER_DISABLED' : 'USER_NOT_FOUND',
          message: '用户不存在或已被禁用',
          statusCode: 401
        }
      });
    }

    req.user = user;
    
    // 从 X-Role header 读取当前角色
    const requestedRole = req.headers['x-role'];
    const userRoles = user.roles || [];
    
    if (requestedRole) {
      // 验证用户确实拥有请求的角色
      if (!userRoles.includes(requestedRole)) {
        return res.status(403).json({ 
          success: false, 
          message: '您不拥有该角色' 
        });
      }
      req.currentRole = requestedRole;
    } else {
      // 如果没有提供 X-Role，使用默认角色（向后兼容）
      // 使用同步版本以保持性能
      req.currentRole = getDefaultRoleSync(userRoles) || (userRoles.length > 0 ? userRoles[0] : null);
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      error: {
        code: 'INVALID_TOKEN',
        message: '无效的认证令牌',
        statusCode: 401
      }
    });
  }
};

// 角色权限检查中间件
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: {
          code: 'UNAUTHORIZED',
          message: '未认证',
          statusCode: 401
        }
      });
    }

    // 如果指定了当前角色，检查当前角色是否在允许的角色列表中
    if (req.currentRole) {
      if (roles.includes(req.currentRole)) {
        return next();
      }
    }
    
    // 向后兼容：检查用户是否拥有任一允许的角色
    const userRoles = req.user.roles || [];
    const hasRole = roles.some(role => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({ 
        success: false, 
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: '权限不足',
          statusCode: 403
        }
      });
    }

    next();
  };
};

// 基于权限表的权限检查中间件
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user || !req.currentRole) {
      return res.status(401).json({ 
        success: false, 
        error: {
          code: 'UNAUTHORIZED',
          message: '未认证',
          statusCode: 401
        }
      });
    }

    const permValue = getPermission(req.currentRole, permission);
    if (!permValue || permValue === false) {
      return res.status(403).json({ 
        success: false, 
        message: '权限不足' 
      });
    }

    next();
  };
};

// 获取当前角色的权限值（用于路由中）
const getCurrentPermission = (req, permission) => {
  if (!req.currentRole) {
    return false;
  }
  return getPermissionSync(req.currentRole, permission);
};

module.exports = { 
  authenticate, 
  authorize, 
  requirePermission, 
  getCurrentPermission 
};























