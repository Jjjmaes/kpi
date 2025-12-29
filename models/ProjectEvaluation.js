const mongoose = require('mongoose');

/**
 * 项目评价模型
 * 用于存储项目成员之间的相互评价
 */
const projectEvaluationSchema = new mongoose.Schema({
  // 关联项目
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  // 评价人
  evaluatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  evaluatorRole: {
    type: String,
    required: true,
    trim: true
    // 移除enum限制，允许动态角色
    // 验证逻辑在业务层处理（检查角色是否允许评价）
  },
  // 被评价人
  evaluatedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  evaluatedRole: {
    type: String,
    required: true,
    trim: true
    // 移除enum限制，允许动态角色
    // 验证逻辑在业务层处理（检查角色是否允许被评价）
  },
  // 评价类型
  evaluationType: {
    type: String,
    enum: ['pm_to_sales', 'executor_to_pm'],
    required: true
  },
  // 评分（1-5分）
  scores: {
    // PM评价销售：信息完整性、沟通质量、问题解决、整体满意度
    // 执行人员评价PM：项目管理、沟通协调、技术支持、整体满意度
    informationCompleteness: { 
      type: Number, 
      min: 1, 
      max: 5,
      required: function() {
        return this.evaluationType === 'pm_to_sales';
      }
    },
    projectManagement: {
      type: Number,
      min: 1,
      max: 5,
      required: function() {
        return this.evaluationType === 'executor_to_pm';
      }
    },
    communicationQuality: { 
      type: Number, 
      min: 1, 
      max: 5,
      required: true
    },
    problemSolving: { 
      type: Number, 
      min: 1, 
      max: 5,
      required: function() {
        return this.evaluationType === 'pm_to_sales';
      }
    },
    technicalSupport: {
      type: Number,
      min: 1,
      max: 5,
      required: function() {
        return this.evaluationType === 'executor_to_pm';
      }
    },
    overallSatisfaction: { 
      type: Number, 
      min: 1, 
      max: 5,
      required: true
    }
  },
  // 评语
  comments: {
    type: String,
    maxlength: 500,
    trim: true
  },
  // 是否匿名
  isAnonymous: {
    type: Boolean,
    default: true
  },
  // 评价时间
  evaluatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// 复合索引：确保每个项目每个评价人对每个被评价人只能评价一次
projectEvaluationSchema.index(
  { projectId: 1, evaluatorId: 1, evaluatedUserId: 1, evaluationType: 1 }, 
  { unique: true }
);

// 优化查询：按被评价人查询
projectEvaluationSchema.index({ evaluatedUserId: 1, evaluatedAt: -1 });

// 优化查询：按项目查询
projectEvaluationSchema.index({ projectId: 1, evaluationType: 1 });

module.exports = mongoose.model('ProjectEvaluation', projectEvaluationSchema);


