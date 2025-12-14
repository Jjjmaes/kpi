const Customer = require('../models/Customer');
const { AppError } = require('../middleware/errorHandler');

/**
 * 客户服务层
 */
class CustomerService {
  /**
   * 获取所有客户（带权限过滤）
   */
  async getAllCustomers(query, requester) {
    const { search, isActive } = query;
    let filter = {};

    // 权限过滤：销售和兼职销售只能看到自己创建的客户
    const isAdmin = requester.roles.includes('admin');
    const isFinance = requester.roles.includes('finance');
    const isSales = requester.roles.includes('sales') || requester.roles.includes('part_time_sales');
    
    if (isSales && !isAdmin && !isFinance) {
      // 销售只能看到自己创建的客户
      filter.createdBy = requester._id;
    }

    // 搜索条件
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { shortName: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { 'contacts.name': { $regex: search, $options: 'i' } }
      ];
    }

    // 激活状态过滤
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    } else {
      filter.isActive = true; // 默认只显示激活的
    }

    return await Customer.find(filter)
      .populate('createdBy', 'name username')
      .sort({ createdAt: -1 });
  }

  /**
   * 获取单个客户详情
   */
  async getCustomerById(customerId) {
    const customer = await Customer.findById(customerId)
      .populate('createdBy', 'name username');

    if (!customer) {
      throw new AppError('客户不存在', 404, 'CUSTOMER_NOT_FOUND');
    }

    return customer;
  }

  /**
   * 创建客户
   */
  async createCustomer(customerData, creator) {
    const { name, shortName, contacts, contactPerson, phone, email, address, notes } = customerData;

    // 验证必填字段
    if (!name) {
      throw new AppError('客户名称不能为空', 400, 'VALIDATION_ERROR');
    }

    // 检查是否已存在同名客户
    const existingCustomer = await Customer.findOne({ name, isActive: true });
    if (existingCustomer) {
      throw new AppError('客户名称已存在', 400, 'DUPLICATE_CUSTOMER');
    }

    // 处理联系人：优先使用 contacts 数组，如果没有则兼容旧的单个联系人字段
    let contactsArray = [];
    if (contacts && Array.isArray(contacts) && contacts.length > 0) {
      contactsArray = contacts.map((contact, index) => ({
        name: (contact.name || '').trim(),
        phone: (contact.phone || '').trim(),
        email: (contact.email || '').trim(),
        position: (contact.position || '').trim(),
        isPrimary: contact.isPrimary === true || (index === 0 && !contacts.some(c => c.isPrimary === true)) // 第一个联系人默认为主要联系人
      })).filter(c => c.name); // 过滤掉没有姓名的联系人
      
      // 确保至少有一个联系人
      if (contactsArray.length === 0) {
        throw new AppError('至少需要添加一个联系人', 400, 'VALIDATION_ERROR');
      }
      
      // 确保至少有一个主要联系人
      if (!contactsArray.some(c => c.isPrimary)) {
        contactsArray[0].isPrimary = true;
      }
    } else if (contactPerson) {
      // 兼容旧数据：将单个联系人转换为数组
      contactsArray = [{
        name: (contactPerson || '').trim(),
        phone: (phone || '').trim(),
        email: (email || '').trim(),
        position: '',
        isPrimary: true
      }].filter(c => c.name);
      
      if (contactsArray.length === 0) {
        throw new AppError('联系人姓名不能为空', 400, 'VALIDATION_ERROR');
      }
    } else {
      throw new AppError('至少需要添加一个联系人', 400, 'VALIDATION_ERROR');
    }

    // 创建客户
    const customer = await Customer.create({
      name,
      shortName: shortName || '',
      contacts: contactsArray,
      // 兼容旧字段
      contactPerson: contactPerson || '',
      phone: phone || '',
      email: email || '',
      address: address || '',
      notes: notes || '',
      createdBy: creator._id
    });

    // 填充创建者信息
    await customer.populate('createdBy', 'name username');

    return customer;
  }

  /**
   * 更新客户
   */
  async updateCustomer(customerId, updateData, requester) {
    const { name, shortName, contacts, contactPerson, phone, email, address, notes, isActive } = updateData;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new AppError('客户不存在', 404, 'CUSTOMER_NOT_FOUND');
    }

    // 权限检查：销售只能编辑自己创建的客户
    const isAdmin = requester.roles.includes('admin');
    const isSales = requester.roles.includes('sales') || requester.roles.includes('part_time_sales');
    
    if (isSales && !isAdmin) {
      if (customer.createdBy.toString() !== requester._id.toString()) {
        throw new AppError('只能编辑自己创建的客户', 403, 'PERMISSION_DENIED');
      }
    }

    // 如果更新名称，检查是否与其他客户重名
    if (name && name !== customer.name) {
      const existingCustomer = await Customer.findOne({ 
        name, 
        isActive: true,
        _id: { $ne: customerId }
      });
      if (existingCustomer) {
        throw new AppError('客户名称已存在', 400, 'DUPLICATE_CUSTOMER');
      }
    }

    // 更新字段
    if (name) customer.name = name;
    if (shortName !== undefined) customer.shortName = shortName || '';
    
    // 处理联系人：优先使用 contacts 数组
    if (contacts !== undefined && Array.isArray(contacts)) {
      customer.contacts = contacts.map((contact, index) => ({
        name: contact.name || '',
        phone: contact.phone || '',
        email: contact.email || '',
        position: contact.position || '',
        isPrimary: contact.isPrimary || (index === 0 && customer.contacts.length === 0)
      }));
    }
    
    // 兼容旧字段
    if (contactPerson !== undefined) customer.contactPerson = contactPerson || '';
    if (phone !== undefined) customer.phone = phone || '';
    if (email !== undefined) customer.email = email || '';
    if (address !== undefined) customer.address = address || '';
    if (notes !== undefined) customer.notes = notes || '';
    if (typeof isActive === 'boolean') customer.isActive = isActive;

    customer.updatedAt = Date.now();
    await customer.save();

    // 填充创建者信息
    await customer.populate('createdBy', 'name username');

    return customer;
  }

  /**
   * 删除客户（软删除）
   */
  async deleteCustomer(customerId) {
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new AppError('客户不存在', 404, 'CUSTOMER_NOT_FOUND');
    }

    // 软删除：设置为非激活状态
    customer.isActive = false;
    customer.updatedAt = Date.now();
    await customer.save();

    return customer;
  }
}

module.exports = new CustomerService();

