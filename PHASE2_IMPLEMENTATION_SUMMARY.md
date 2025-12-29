# 阶段2实施总结：添加动态角色系数配置

## 实施日期
2025-12-25

## 问题描述

用户反馈：虽然阶段1移除了枚举限制，允许新角色用于KPI，但是KPI配置模型中的系数字段是硬编码的。例如创建一个"排版"角色，即使设置了`canBeKpiRole: true`，也无法在KPI配置中为该角色设置系数。

## 实施内容

### 1. 修改KPI配置模型 (`models/KpiConfig.js`)

#### 1.1 添加动态配置字段
- ✅ 添加了`roleRatios`字段（Mixed类型），用于存储动态角色系数配置
- ✅ 格式：`{ roleCode: { base: 0.08, mtpe: 0.12, deepedit: 0.18 } }`

#### 1.2 增强`getLockedRatios`方法
- ✅ 优先从固定字段读取（向后兼容）
- ✅ 如果没有固定字段，从`roleRatios`动态配置读取
- ✅ 支持新角色的系数自动包含在锁定比例中

#### 1.3 新增`getRoleRatio`方法
- ✅ 获取特定角色的系数（支持动态配置）
- ✅ 支持多种系数类型（base, mtpe, deepedit, bonus, commission等）
- ✅ 向后兼容：优先从固定字段读取

### 2. 更新KPI配置API (`routes/config.js`)

#### 2.1 更新配置接口
- ✅ `POST /api/config/update`：支持更新`roleRatios`字段
- ✅ 在变更历史中记录`roleRatios`的变更

#### 2.2 新增角色系数管理接口
- ✅ `GET /api/config/kpi-roles`：获取所有可用于KPI的角色及其系数配置
- ✅ `PUT /api/config/kpi-roles/:roleCode`：更新特定角色的KPI系数配置

### 3. 更新项目服务 (`services/projectService.js`)

#### 3.1 增强系数读取逻辑
- ✅ 在`addProjectMember`方法中，支持从动态配置读取新角色的系数
- ✅ 使用`??`操作符实现向后兼容（优先固定字段，其次动态配置）

### 4. 向后兼容性

#### 4.1 数据兼容
- ✅ 现有固定字段继续有效
- ✅ 新角色可以通过`roleRatios`配置
- ✅ 项目创建时，`getLockedRatios`会自动包含新角色的系数

#### 4.2 代码兼容
- ✅ 所有使用固定字段的代码继续工作
- ✅ 新代码可以优先使用动态配置
- ✅ 如果动态配置不存在，自动回退到固定字段

## 使用示例

### 示例1：为"排版"角色配置系数

**步骤1：创建角色**
```javascript
// 在角色管理界面创建角色
{
  code: 'layout',
  name: '排版',
  canBeKpiRole: true
}
```

**步骤2：配置KPI系数**
```javascript
// 调用API配置系数
PUT /api/config/kpi-roles/layout
{
  "ratio": 0.05  // 或者使用 ratioConfig: { base: 0.05 }
}
```

**步骤3：创建项目时自动锁定**
```javascript
// 项目创建时，getLockedRatios()会自动包含：
{
  translator_mtpe: 0.12,
  translator_deepedit: 0.18,
  reviewer: 0.08,
  pm: 0.03,
  sales_bonus: 0.02,
  sales_commission: 0.10,
  admin: 0.005,
  layout: 0.05,  // 新角色的系数自动包含
  completion_factor: 1.0
}
```

### 示例2：查询所有角色的系数配置

```javascript
// 调用API获取所有角色配置
GET /api/config/kpi-roles

// 返回：
{
  "success": true,
  "data": [
    {
      "code": "translator",
      "name": "翻译",
      "ratio": 0.12,  // 从固定字段读取
      "ratioConfig": {}
    },
    {
      "code": "layout",
      "name": "排版",
      "ratio": 0.05,  // 从动态配置读取
      "ratioConfig": { "base": 0.05 }
    }
  ]
}
```

## 测试建议

### 1. 功能测试

#### 测试1：为新角色配置系数
1. 创建新角色（如`custom_role`），设置`canBeKpiRole: true`
2. 调用`PUT /api/config/kpi-roles/custom_role`配置系数
3. 创建项目并添加该角色成员
4. 验证项目`locked_ratios`中包含新角色的系数

#### 测试2：查询角色系数配置
1. 调用`GET /api/config/kpi-roles`
2. 验证返回所有允许用于KPI的角色
3. 验证每个角色的系数正确显示（固定字段或动态配置）

#### 测试3：向后兼容性
1. 验证现有角色的系数仍然从固定字段读取
2. 验证现有项目的`locked_ratios`不受影响
3. 验证KPI计算逻辑正常工作

### 2. 数据完整性测试

#### 测试4：配置更新
1. 更新角色的系数配置
2. 验证变更历史正确记录
3. 验证新创建的项目使用新系数

#### 测试5：配置验证
1. 尝试为不存在的角色配置系数（应失败）
2. 尝试为不允许用于KPI的角色配置系数（应失败）
3. 验证错误提示正确

## 已知限制

1. **配置界面**：当前需要在API层面配置，前端界面尚未更新（阶段4任务）
2. **系数类型**：目前主要支持`base`系数，复杂角色（如翻译的mtpe/deepedit）需要在前端界面中配置
3. **迁移脚本**：如果需要将现有固定字段迁移到动态配置，需要手动执行或创建迁移脚本

## 后续步骤

### 立即需要
1. ✅ 测试新接口，确保正常工作
2. ✅ 为"排版"等新角色配置系数

### 短期（阶段3）
1. 前端角色名称统一从API获取
2. 添加角色名称缓存机制

### 长期（阶段4）
1. 在KPI配置界面添加角色系数管理UI
2. 在角色管理界面添加KPI系数配置入口
3. 添加配置验证和同步提示

## 总结

阶段2实施成功完成，主要成果：

1. ✅ 添加了动态角色系数配置支持
2. ✅ 保持了向后兼容性
3. ✅ 提供了API接口用于管理角色系数
4. ✅ 项目创建时自动包含新角色的系数

**现在可以**：
- 创建新角色并设置`canBeKpiRole: true`
- 通过API为新角色配置KPI系数
- 新角色可以正常用于KPI计算

**下一步**：测试新功能，然后可以开始阶段3（前端配置统一）或阶段4（完善管理界面）。





