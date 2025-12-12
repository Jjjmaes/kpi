const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');

/**
 * 用户服务层
 */
class UserService {
  /**
   * 密码复杂度校验
   */
  validatePassword(password) {
    const minLen = 8;
    if (!password || password.length < minLen) {
      return '密码长度至少 8 位';
    }
    const upper = /[A-Z]/.test(password);
    const lower = /[a-z]/.test(password);
    const digit = /\d/.test(password);
    const special = /[^A-Za-z0-9]/.test(password);
    if (!upper || !lower || !digit || !special) {
      return '密码需包含大写字母、小写字母、数字和特殊字符';
    }
    if (password.length > 64) {
      return '密码长度不能超过 64 位';
    }
    return null;
  }

  /**
   * 获取所有激活用户
   */
  async getAllActiveUsers() {
    return await User.find({ isActive: true })
      .select('-password')
      .sort({ createdAt: -1 });
  }

  /**
   * 获取单个用户信息
   */
  async getUserById(userId, requester) {
    // 用户只能查看自己的信息，管理员和财务可以查看所有
    const canViewAll = requester.roles.includes('admin') || requester.roles.includes('finance');
    const targetUserId = canViewAll ? userId : requester._id;

    const user = await User.findById(targetUserId).select('-password');
    if (!user) {
      throw new AppError('用户不存在', 404, 'USER_NOT_FOUND');
    }

    return user;
  }

  /**
   * 创建用户
   */
  async createUser(userData) {
    const { username, password, name, email, phone, roles } = userData;

    // 验证必填字段
    if (!username || !password || !name || !email || !roles || roles.length === 0) {
      throw new AppError('请填写所有必填字段', 400, 'VALIDATION_ERROR');
    }

    // 检查用户名或邮箱是否已存在
    const existingUser = await User.findOne({ 
      $or: [{ username }, { email }] 
    });

    if (existingUser) {
      throw new AppError('用户名或邮箱已存在', 400, 'DUPLICATE_USER');
    }

    // 验证密码复杂度
    const pwdError = this.validatePassword(password);
    if (pwdError) {
      throw new AppError(pwdError, 400, 'INVALID_PASSWORD');
    }

    // 创建用户
    const user = await User.create({
      username,
      password,
      name,
      email,
      phone: phone || '',
      roles
    });

    // 返回用户信息（不包含密码）
    return {
      id: user._id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone: user.phone,
      roles: user.roles
    };
  }

  /**
   * 更新用户
   */
  async updateUser(userId, updateData) {
    const { name, email, phone, roles, isActive } = updateData;
    
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('用户不存在', 404, 'USER_NOT_FOUND');
    }

    // 更新字段
    if (name) user.name = name;
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone || '';
    if (roles) user.roles = roles;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    user.updatedAt = Date.now();

    await user.save();

    // 返回更新后的用户信息
    return {
      id: user._id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone: user.phone,
      roles: user.roles,
      isActive: user.isActive
    };
  }

  /**
   * 生成随机密码
   */
  generateRandomPassword() {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';
    const allChars = uppercase + lowercase + numbers + special;
    
    // 确保至少包含每种类型的字符
    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    // 补充到12位（8位最小要求 + 4位额外）
    for (let i = password.length; i < 12; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // 打乱字符顺序
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * 重置用户密码
   */
  async resetUserPassword(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('用户不存在', 404, 'USER_NOT_FOUND');
    }

    // 生成随机密码
    const newPassword = this.generateRandomPassword();

    // 重置密码并设置必须修改标志
    user.password = newPassword;
    user.passwordMustChange = true;
    user.passwordUpdatedAt = null; // 清除之前的密码更新时间
    user.updatedAt = Date.now();
    await user.save();

    return {
      newPassword: newPassword, // 返回新密码，管理员可以告知用户
      passwordMustChange: true
    };
  }

  /**
   * 删除用户（软删除）
   */
  async deleteUser(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('用户不存在', 404, 'USER_NOT_FOUND');
    }

    // 软删除：设置为非激活状态
    user.isActive = false;
    user.updatedAt = Date.now();
    await user.save();

    return user;
  }
}

module.exports = new UserService();

