// Help Documentation Module
import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { showModal, closeModal, showSection } from '../core/ui.js';
import { showToast } from '../core/utils.js';

// 帮助文档内容（结构化数据）
const helpContent = {
  overview: {
    title: '系统概述',
    sections: [
      {
        title: '系统简介',
        content: `
          <p>语家 OA 系统是一个专为翻译公司设计的办公自动化系统，支持项目全生命周期管理、自动化 KPI 计算、财务管理、行政办公和邮件通知等功能。</p>
          <h4>主要功能模块</h4>
          <ul>
            <li><strong>用户管理</strong>：用户创建、角色分配、权限管理</li>
            <li><strong>客户管理</strong>：客户信息管理、联系人管理</li>
            <li><strong>项目管理</strong>：项目创建、成员分配、状态跟踪、附件上传</li>
            <li><strong>KPI 管理</strong>：自动计算绩效、月度汇总、审核</li>
            <li><strong>财务管理</strong>：发票申请、回款管理、财务统计</li>
            <li><strong>报销管理</strong>：报销申请、审批、支付管理</li>
            <li><strong>行政办公</strong>：快递管理、办公用品采购、章证使用</li>
            <li><strong>邮件通知</strong>：项目分配邮件、附件发送</li>
          </ul>
        `
      },
      {
        title: '系统角色',
        content: `
          <table class="data-table" style="margin-top: 10px;">
            <thead>
              <tr>
                <th>角色</th>
                <th>权限说明</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><strong>管理员 (admin)</strong></td><td>所有权限，可管理用户、配置系统</td></tr>
              <tr><td><strong>财务 (finance)</strong></td><td>查看所有项目、管理发票和回款、审批报销</td></tr>
              <tr><td><strong>销售 (sales)</strong></td><td>创建项目、管理自己创建的客户和项目</td></tr>
              <tr><td><strong>兼职销售 (part_time_sales)</strong></td><td>创建项目、管理自己创建的客户和项目</td></tr>
              <tr><td><strong>项目经理 (pm)</strong></td><td>查看分配给自己的项目、管理项目成员</td></tr>
              <tr><td><strong>翻译 (translator)</strong></td><td>查看分配给自己的项目</td></tr>
              <tr><td><strong>审校 (reviewer)</strong></td><td>查看分配给自己的项目</td></tr>
              <tr><td><strong>排版 (layout)</strong></td><td>查看分配给自己的项目</td></tr>
              <tr><td><strong>综合岗 (admin_staff)</strong></td><td>处理行政事务、管理快递、办公用品、章证使用</td></tr>
            </tbody>
          </table>
        `
      }
    ]
  },
  login: {
    title: '登录与用户管理',
    sections: [
      {
        title: '系统登录',
        content: `
          <h4>操作步骤</h4>
          <ol>
            <li>打开系统登录页面</li>
            <li>输入用户名和密码</li>
            <li>点击"登录"按钮</li>
            <li>首次登录或密码重置后，系统会提示修改密码</li>
          </ol>
          <h4>注意事项</h4>
          <ul>
            <li>密码复杂度要求：
              <ul>
                <li>至少 8 位</li>
                <li>包含大写字母、小写字母、数字和特殊字符</li>
              </ul>
            </li>
            <li>如果忘记密码，请联系管理员重置</li>
          </ul>
        `
      },
      {
        title: '个人中心',
        content: `
          <h4>修改个人信息</h4>
          <ol>
            <li>点击右上角用户名，选择"个人中心"</li>
            <li>在"基本信息"卡片中修改邮箱、电话</li>
            <li>点击"更新信息"按钮</li>
          </ol>
          <p><strong>注意：</strong>用户名和姓名只能由管理员修改。</p>
          <h4>修改密码</h4>
          <ol>
            <li>在个人中心页面</li>
            <li>在"修改密码"卡片中填写当前密码和新密码</li>
            <li>点击"修改密码"按钮</li>
          </ol>
        `
      }
    ]
  },
  customer: {
    title: '客户管理',
    sections: [
      {
        title: '创建客户',
        content: `
          <h4>操作步骤</h4>
          <ol>
            <li>进入"客户管理"页面</li>
            <li>点击"创建客户"按钮</li>
            <li>填写客户信息：
              <ul>
                <li><strong>客户名称</strong> *（必填）</li>
                <li><strong>客户简称</strong>（可选）</li>
                <li><strong>联系人姓名</strong> *（必填）</li>
                <li><strong>联系人电话</strong> *（必填）</li>
                <li><strong>联系人邮箱</strong> *（必填）</li>
                <li><strong>联系人职位</strong>（可选）</li>
                <li><strong>地址</strong>（可选）</li>
              </ul>
            </li>
            <li>点击"创建"按钮</li>
          </ol>
          <h4>权限说明</h4>
          <ul>
            <li><strong>销售/兼职销售</strong>：只能查看和编辑自己创建的客户</li>
            <li><strong>管理员/财务</strong>：可以查看和编辑所有客户</li>
            <li><strong>其他角色</strong>：客户信息会被脱敏处理（显示为 *****）</li>
          </ul>
        `
      },
      {
        title: '编辑客户',
        content: `
          <h4>操作步骤</h4>
          <ol>
            <li>在客户列表中找到要编辑的客户</li>
            <li>点击"编辑"按钮</li>
            <li>修改客户信息</li>
            <li>点击"更新"按钮</li>
          </ol>
          <h4>添加联系人</h4>
          <p>在编辑客户时，可以添加多个联系人，并设置一个联系人为"主要联系人"。</p>
        `
      }
    ]
  },
  project: {
    title: '项目管理',
    sections: [
      {
        title: '创建项目',
        content: `
          <h4>操作步骤</h4>
          <ol>
            <li>进入"项目管理"页面</li>
            <li>点击"创建项目"按钮</li>
            <li>填写项目基本信息：
              <ul>
                <li><strong>项目编号</strong>（可选，留空自动生成）</li>
                <li><strong>项目名称</strong> *（必填）</li>
                <li><strong>选择客户</strong> *（必填）</li>
                <li><strong>业务类型</strong> *（笔译/口译/转录/本地化/其他）</li>
                <li><strong>源语种</strong> *（必填）</li>
                <li><strong>目标语种</strong> *（至少一个，可添加多个）</li>
                <li><strong>项目总金额</strong> *（必填）</li>
                <li><strong>交付时间</strong> *（必填）</li>
              </ul>
            </li>
            <li>添加项目成员（可选）</li>
            <li>上传项目附件（可选，会通过邮件发送给成员）</li>
            <li>点击"创建项目"按钮</li>
          </ol>
        `
      },
      {
        title: '查看项目列表',
        content: `
          <h4>筛选功能</h4>
          <ul>
            <li><strong>按月份筛选</strong>：选择项目创建月份</li>
            <li><strong>按状态筛选</strong>：待开始/待安排/进行中/已完成/已取消</li>
            <li><strong>按业务类型筛选</strong>：笔译/口译/转录/本地化/其他</li>
            <li><strong>按角色筛选</strong>：查看特定角色的项目（仅多角色用户显示）</li>
            <li><strong>按客户筛选</strong>：选择特定客户的项目</li>
            <li><strong>按开票状态筛选</strong>：未申请/待审批/已开票/已拒绝</li>
            <li><strong>按回款状态筛选</strong>：未支付/部分支付/已支付</li>
          </ul>
          <h4>角色筛选说明</h4>
          <ul>
            <li><strong>多角色用户</strong>：如果用户拥有多个项目成员相关角色（如翻译和审校），会显示角色筛选器</li>
            <li><strong>自动过滤</strong>：在顶部切换角色时，项目列表会自动根据当前角色过滤</li>
            <li><strong>手动筛选</strong>：也可以在项目列表的角色筛选器中选择特定角色或"全部角色"</li>
            <li><strong>单角色用户</strong>：如果用户只有一个角色，角色筛选器会自动隐藏</li>
          </ul>
          <h4>项目状态说明</h4>
          <ul>
            <li><strong>待开始</strong>：项目已创建，未开始</li>
            <li><strong>待安排</strong>：项目已创建，等待安排成员或等待成员确认</li>
            <li><strong>进行中</strong>：项目已开始，正在执行（所有生产人员都已接受）</li>
            <li><strong>已完成</strong>：项目已完成</li>
            <li><strong>已取消</strong>：项目已取消</li>
          </ul>
        `
      },
      {
        title: '项目成员管理',
        content: `
          <h4>添加成员</h4>
          <p>在创建项目时或项目编辑页面可以添加项目成员。</p>
          <h4>成员接受状态</h4>
          <ul>
            <li><strong>生产人员</strong>（翻译、审校、排版、兼职翻译）：添加后状态为"待确认"，需要成员主动接受</li>
            <li><strong>管理人员</strong>（项目经理、销售等）：添加后自动接受，无需确认</li>
          </ul>
          <h4>成员接受/拒绝项目分配</h4>
          <p><strong>操作步骤（生产人员）：</strong></p>
          <ol>
            <li>被添加的生产人员登录后，在项目详情页面可以看到自己的成员记录</li>
            <li>如果状态为"⏳ 待确认"，会显示"接受"和"拒绝"按钮</li>
            <li><strong>接受项目</strong>：
              <ul>
                <li>点击"接受"按钮</li>
                <li>状态变为"✅ 已接受"，显示接受日期</li>
                <li>项目经理和项目创建者会收到通知</li>
              </ul>
            </li>
            <li><strong>拒绝项目</strong>：
              <ul>
                <li>点击"拒绝"按钮</li>
                <li>输入拒绝原因（可选）</li>
                <li>状态变为"❌ 已拒绝"，显示拒绝日期和原因</li>
                <li>项目经理和项目创建者会收到通知</li>
              </ul>
            </li>
          </ol>
          <h4>项目状态影响</h4>
          <ul>
            <li>当所有生产人员都接受后，项目状态自动变为"进行中"</li>
            <li>如果有成员拒绝，项目保持"待安排"状态，需要重新安排人员</li>
            <li>拒绝后重新安排的新成员需要重新确认</li>
          </ul>
        `
      },
      {
        title: '项目状态操作',
        content: `
          <h4>项目状态自动流转</h4>
          <p><strong>状态流转规则：</strong></p>
          <ol>
            <li><strong>待开始</strong> → <strong>待安排</strong>：
              <ul>
                <li>添加生产人员后自动变为"待安排"</li>
                <li>项目等待成员确认</li>
              </ul>
            </li>
            <li><strong>待安排</strong> → <strong>进行中</strong>：
              <ul>
                <li>当所有生产角色都有有效成员且都已接受后，自动变为"进行中"</li>
                <li>如果某个角色有拒绝的成员，需要重新安排后才能进入"进行中"</li>
              </ul>
            </li>
            <li><strong>进行中</strong> → <strong>已完成</strong>：
              <ul>
                <li>手动点击"完成项目"按钮</li>
                <li>系统会检查所有生产人员是否都已接受，如果有拒绝的成员，无法完成项目</li>
              </ul>
            </li>
          </ol>
          <h4>完成项目</h4>
          <p>在项目详情页面点击"完成项目"按钮，系统会检查所有生产人员是否都已接受，如果检查通过，项目状态变为"已完成"。</p>
          <h4>标记返修/延期/客诉</h4>
          <p>在项目详情页面可以标记返修、延期、客诉，填写相应原因。</p>
        `
      }
    ]
  },
  kpi: {
    title: 'KPI 管理',
    sections: [
      {
        title: '生成月度 KPI',
        content: `
          <h4>操作步骤（管理员/财务）</h4>
          <ol>
            <li>进入"KPI 管理"页面</li>
            <li>选择要生成的月份</li>
            <li>点击"生成月度 KPI"按钮</li>
            <li>系统会自动计算所有用户的 KPI</li>
          </ol>
        `
      },
      {
        title: '查看 KPI',
        content: `
          <h4>查看个人 KPI</h4>
          <ol>
            <li>进入"KPI 管理"页面</li>
            <li>选择月份和角色（可选）</li>
            <li>查看自己的 KPI 记录</li>
          </ol>
          <h4>查看所有用户 KPI（管理员/财务）</h4>
          <ol>
            <li>进入"KPI 管理"页面</li>
            <li>选择用户、月份和角色（可选）</li>
            <li>查看 KPI 记录</li>
          </ol>
        `
      },
      {
        title: 'KPI 审核',
        content: `
          <h4>操作步骤（管理员/财务）</h4>
          <ol>
            <li>在 KPI 记录列表中找到要审核的记录</li>
            <li>点击"审核"按钮</li>
            <li>选择审核结果：通过或拒绝</li>
            <li>如果拒绝，需要填写拒绝原因</li>
            <li>点击"确认"按钮</li>
          </ol>
        `
      }
    ]
  },
  finance: {
    title: '财务管理',
    sections: [
      {
        title: '添加回款记录',
        content: `
          <h4>操作步骤（管理员/财务）</h4>
          <ol>
            <li>进入"财务管理"页面</li>
            <li>在"回款记录"区域点击"添加回款"按钮</li>
            <li>选择项目</li>
            <li>填写回款信息：
              <ul>
                <li><strong>回款金额</strong> *（必填）</li>
                <li><strong>回款日期</strong> *（必填）</li>
                <li><strong>支付方式</strong>（银行转账/现金/支付宝/微信等）</li>
                <li><strong>收款人</strong>（仅当方式为现金/支付宝/微信时必填）</li>
                <li><strong>备注/凭证号</strong>（可选）</li>
              </ul>
            </li>
            <li>点击"添加"按钮</li>
          </ol>
        `
      },
      {
        title: '申请开票',
        content: `
          <h4>操作步骤（销售/兼职销售）</h4>
          <ol>
            <li>进入"财务管理"页面</li>
            <li>在"发票管理"区域点击"申请开票"按钮</li>
            <li>选择要申请开票的项目（可多选）</li>
            <li>填写申请信息：
              <ul>
                <li><strong>申请金额</strong> *（必填）</li>
                <li><strong>申请原因</strong>（可选）</li>
              </ul>
            </li>
            <li>点击"提交申请"按钮</li>
          </ol>
        `
      },
      {
        title: '审批发票申请',
        content: `
          <h4>操作步骤（财务/管理员）</h4>
          <ol>
            <li>进入"财务管理"页面</li>
            <li>在"发票申请"区域查看待审批的申请</li>
            <li>点击"批准"或"拒绝"按钮</li>
            <li>如果批准，需要填写发票信息（发票号、开票日期等）</li>
            <li>点击"确认"按钮</li>
          </ol>
        `
      }
    ]
  },
  expense: {
    title: '报销管理',
    sections: [
      {
        title: '创建报销申请',
        content: `
          <h4>操作步骤（专职人员）</h4>
          <ol>
            <li>进入"报销管理"页面</li>
            <li>点击"新建申请"按钮</li>
            <li>填写报销信息：
              <ul>
                <li><strong>费用类型</strong> *（差旅费/餐费/交通费/办公用品/通讯费/其他）</li>
                <li><strong>费用明细</strong> *（至少一条）：
                  <ul>
                    <li>费用日期、金额、说明</li>
                    <li>发票号（可选）</li>
                    <li>发票照片（可选，会通过邮件发送给审批人）</li>
                  </ul>
                </li>
                <li><strong>申请说明</strong> *（必填）</li>
              </ul>
            </li>
            <li>点击"提交申请"按钮</li>
          </ol>
          <p><strong>注意：</strong>发票照片会通过邮件发送给财务和管理员，不会保存到服务器。</p>
        `
      },
      {
        title: '审批报销申请',
        content: `
          <h4>操作步骤（财务/管理员）</h4>
          <ol>
            <li>进入"报销管理"页面</li>
            <li>在"待审批"标签页查看待审批的申请</li>
            <li>点击"查看"查看申请详情和发票照片</li>
            <li>点击"批准"或"拒绝"</li>
            <li>填写审批意见或拒绝原因</li>
            <li>确认操作</li>
          </ol>
        `
      },
      {
        title: '标记已支付',
        content: `
          <h4>操作步骤（财务/管理员）</h4>
          <ol>
            <li>找到状态为"已批准"的申请</li>
            <li>点击"查看"查看申请详情</li>
            <li>点击"标记已支付"按钮</li>
            <li>填写支付信息（可选）</li>
            <li>确认操作</li>
          </ol>
        `
      }
    ]
  },
  express: {
    title: '快递管理',
    sections: [
      {
        title: '创建快递申请',
        content: `
          <h4>操作步骤</h4>
          <ol>
            <li>进入"快递管理"页面</li>
            <li>点击"新建申请"按钮</li>
            <li>填写快递信息：
              <ul>
                <li><strong>收件人信息</strong> *（姓名、电话、地址）</li>
                <li><strong>邮寄内容</strong> *（促销品/文件等）</li>
                <li><strong>快递公司</strong>（可选）</li>
              </ul>
            </li>
            <li>点击"提交申请"按钮</li>
          </ol>
        `
      },
      {
        title: '处理快递申请（综合岗）',
        content: `
          <h4>操作步骤</h4>
          <ol>
            <li>进入"快递管理"页面</li>
            <li>在"申请管理"标签页查看待处理的申请</li>
            <li>点击"确认"处理申请</li>
            <li>发出快递后，点击"已发出"按钮，填写快递单号</li>
          </ol>
        `
      }
    ]
  },
  officeSupply: {
    title: '办公用品采购管理',
    sections: [
      {
        title: '创建采购申请',
        content: `
          <h4>操作步骤（综合岗）</h4>
          <ol>
            <li>进入"办公用品采购"页面</li>
            <li>点击"新建申请"按钮</li>
            <li>填写采购信息：
              <ul>
                <li><strong>采购物品</strong> *（可添加多个）</li>
                <li><strong>总金额</strong> *（自动计算）</li>
                <li><strong>采购用途</strong> *（必填）</li>
                <li><strong>紧急程度</strong>（普通/紧急）</li>
              </ul>
            </li>
            <li>点击"提交申请"按钮</li>
          </ol>
        `
      },
      {
        title: '审批采购申请（财务）',
        content: `
          <h4>操作步骤</h4>
          <ol>
            <li>进入"办公用品采购"页面</li>
            <li>在"待审批"标签页查看待审批的申请</li>
            <li>点击"查看"查看申请详情</li>
            <li>点击"批准"或"拒绝"</li>
            <li>填写审批意见或拒绝原因</li>
            <li>确认操作</li>
          </ol>
        `
      }
    ]
  },
  seal: {
    title: '章证使用管理',
    sections: [
      {
        title: '创建章证使用申请',
        content: `
          <h4>操作步骤</h4>
          <ol>
            <li>进入"章证使用"页面</li>
            <li>点击"新建申请"按钮</li>
            <li>填写申请信息：
              <ul>
                <li><strong>章证类型</strong> *（公章/合同章/法人章/财务章/营业执照等）</li>
                <li><strong>使用用途</strong> *（必填）</li>
                <li><strong>使用日期</strong> *（必填）</li>
                <li><strong>归还日期</strong>（可选）</li>
              </ul>
            </li>
            <li>点击"提交申请"按钮</li>
          </ol>
        `
      },
      {
        title: '处理章证申请（综合岗）',
        content: `
          <h4>操作步骤</h4>
          <ol>
            <li>进入"章证使用"页面</li>
            <li>在"申请管理"标签页查看待处理的申请</li>
            <li>点击"确认"确认章证已使用</li>
            <li>章证归还后，点击"归还"按钮，填写归还信息</li>
          </ol>
        `
      }
    ]
  },
  faq: {
    title: '常见问题',
    sections: [
      {
        title: '登录问题',
        content: `
          <h4>Q: 忘记密码怎么办？</h4>
          <p>A: 请联系管理员重置密码。</p>
          <h4>Q: 首次登录提示修改密码？</h4>
          <p>A: 这是正常的安全设置，请按照密码复杂度要求设置新密码。</p>
        `
      },
      {
        title: '权限问题',
        content: `
          <h4>Q: 为什么看不到某些项目？</h4>
          <p>A: 根据角色权限，您只能查看：</p>
          <ul>
            <li>自己创建的项目（销售/兼职销售）</li>
            <li>分配给自己的项目（项目经理/翻译/审校/排版）</li>
            <li>所有项目（管理员/财务）</li>
          </ul>
          <h4>Q: 为什么不能编辑项目？</h4>
          <p>A: 只有管理员和项目创建人可以编辑项目。</p>
        `
      },
      {
        title: '项目问题',
        content: `
          <h4>Q: 如何添加项目成员？</h4>
          <p>A: 在创建项目时添加，或在项目编辑页面添加。</p>
          <h4>Q: 项目成员需要确认吗？</h4>
          <p>A: 生产人员（翻译、审校、排版、兼职翻译）需要主动接受，管理人员（项目经理、销售等）自动接受。</p>
          <h4>Q: 如何接受/拒绝项目分配？</h4>
          <p>A: 被添加的生产人员登录后，在项目详情页面可以看到"接受"和"拒绝"按钮，点击即可操作。</p>
          <h4>Q: 项目状态什么时候会变为"进行中"？</h4>
          <p>A: 当所有生产角色都有有效成员且都已接受后，项目状态会自动变为"进行中"。</p>
          <h4>Q: 如果成员拒绝了项目怎么办？</h4>
          <p>A: 项目经理需要删除拒绝的成员，然后重新添加新成员。新成员需要重新确认。</p>
          <h4>Q: 多角色用户如何查看不同角色的项目？</h4>
          <p>A: 在页面顶部切换角色，项目列表会自动根据当前角色过滤。也可以在项目列表的角色筛选器中选择特定角色。</p>
          <h4>Q: 项目附件在哪里？</h4>
          <p>A: 附件通过邮件发送给项目成员，不会保存在系统中。</p>
        `
      },
      {
        title: '报销问题',
        content: `
          <h4>Q: 报销申请的发票照片在哪里？</h4>
          <p>A: 发票照片通过邮件发送给财务和管理员，不会保存在系统中。请检查邮箱中的报销申请通知邮件。</p>
          <h4>Q: 兼职人员可以申请报销吗？</h4>
          <p>A: 不可以，只有专职人员可以申请报销。</p>
        `
      }
    ]
  }
};

// 当前选中的帮助主题
let currentHelpTopic = 'overview';
let searchKeyword = '';

// 加载帮助文档列表
export function loadHelpList() {
  const helpSection = document.getElementById('help');
  if (!helpSection) return;
  
  const topics = Object.keys(helpContent);
  const topicList = topics.map(key => {
    const topic = helpContent[key];
    return `
      <div class="help-topic-item" data-topic="${key}" data-click="showHelpTopic('${key}')" style="padding: 12px; border: 1px solid #e5e7eb; border-radius: 4px; margin-bottom: 8px; cursor: pointer; transition: background 0.2s;">
        <h3 style="margin: 0 0 4px 0; color: #667eea;">${topic.title}</h3>
        <p style="margin: 0; color: #666; font-size: 14px;">${topic.sections.length} 个主题</p>
      </div>
    `;
  }).join('');
  
  helpSection.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="margin:0;">帮助文档</h2>
      <div style="display:flex;gap:8px;">
        <input type="text" id="helpSearch" placeholder="搜索帮助内容..." style="padding: 6px 12px; border: 1px solid #e5e7eb; border-radius: 4px; width: 300px;" data-change="searchHelp()">
        <button data-click="showHelpTopic('overview')" style="padding: 6px 12px;">返回首页</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:250px 1fr;gap:20px;">
      <div class="card" style="height:fit-content;">
        <h3 style="margin:0 0 12px 0;font-size:16px;">目录</h3>
        <div id="helpTopicList" style="max-height:600px;overflow-y:auto;">
          ${topicList}
        </div>
      </div>
      <div class="card">
        <div id="helpContentArea"></div>
      </div>
    </div>
  `;
  
  // 绑定搜索事件
  const searchInput = document.getElementById('helpSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchKeyword = e.target.value.trim();
      if (searchKeyword) {
        searchHelp();
      } else {
        showHelpTopic(currentHelpTopic);
      }
    });
  }
  
  // 显示默认主题
  showHelpTopic('overview');
}

// 显示帮助主题
export function showHelpTopic(topicKey) {
  currentHelpTopic = topicKey;
  const topic = helpContent[topicKey];
  if (!topic) return;
  
  const contentArea = document.getElementById('helpContentArea');
  if (!contentArea) return;
  
  // 高亮当前选中的主题
  document.querySelectorAll('.help-topic-item').forEach(item => {
    if (item.dataset.topic === topicKey) {
      item.style.background = '#f3f4f6';
      item.style.borderColor = '#667eea';
    } else {
      item.style.background = '';
      item.style.borderColor = '#e5e7eb';
    }
  });
  
  const sectionsHtml = topic.sections.map((section, index) => `
    <div class="help-section" style="margin-bottom: 30px; padding-bottom: 30px; border-bottom: ${index < topic.sections.length - 1 ? '1px solid #e5e7eb' : 'none'};">
      <h3 style="margin: 0 0 16px 0; color: #333; font-size: 20px;">${section.title}</h3>
      <div style="color: #666; line-height: 1.8;">
        ${section.content}
      </div>
    </div>
  `).join('');
  
  contentArea.innerHTML = `
    <h2 style="margin: 0 0 24px 0; color: #333;">${topic.title}</h2>
    ${sectionsHtml}
  `;
  
  // 如果有搜索关键词，高亮显示
  if (searchKeyword) {
    highlightSearchKeyword(contentArea, searchKeyword);
  }
}

// 搜索帮助内容
export function searchHelp() {
  if (!searchKeyword) {
    showHelpTopic(currentHelpTopic);
    return;
  }
  
  const contentArea = document.getElementById('helpContentArea');
  if (!contentArea) return;
  
  const results = [];
  const keyword = searchKeyword.toLowerCase();
  
  // 搜索所有主题
  Object.keys(helpContent).forEach(topicKey => {
    const topic = helpContent[topicKey];
    topic.sections.forEach(section => {
      const titleMatch = section.title.toLowerCase().includes(keyword);
      const contentMatch = section.content.toLowerCase().includes(keyword);
      
      if (titleMatch || contentMatch) {
        results.push({
          topicKey,
          topicTitle: topic.title,
          sectionTitle: section.title,
          sectionContent: section.content
        });
      }
    });
  });
  
  if (results.length === 0) {
    contentArea.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #999;">
        <p style="font-size: 18px; margin-bottom: 8px;">未找到相关内容</p>
        <p>请尝试其他关键词</p>
      </div>
    `;
    return;
  }
  
  const resultsHtml = results.map(result => `
    <div class="help-search-result" style="margin-bottom: 24px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 4px;">
      <div style="margin-bottom: 8px;">
        <span style="color: #667eea; font-weight: 600;">${result.topicTitle}</span>
        <span style="color: #999; margin: 0 8px;">/</span>
        <span style="color: #333; font-weight: 600;">${result.sectionTitle}</span>
      </div>
      <div style="color: #666; line-height: 1.8;">
        ${highlightText(result.sectionContent, keyword)}
      </div>
      <button class="btn-small btn-primary" style="margin-top: 12px;" data-click="showHelpTopic('${result.topicKey}')">查看完整内容</button>
    </div>
  `).join('');
  
  contentArea.innerHTML = `
    <h2 style="margin: 0 0 24px 0; color: #333;">搜索结果（${results.length} 条）</h2>
    ${resultsHtml}
  `;
}

// 高亮搜索关键词
function highlightText(text, keyword) {
  if (!keyword) return text;
  const regex = new RegExp(`(${keyword})`, 'gi');
  return text.replace(regex, '<mark style="background: #ffeb3b; padding: 2px 4px; border-radius: 2px;">$1</mark>');
}

// 高亮内容区域中的关键词
function highlightSearchKeyword(element, keyword) {
  if (!element || !keyword) return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node);
  }
  
  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    const regex = new RegExp(`(${keyword})`, 'gi');
    if (regex.test(text)) {
      const highlighted = text.replace(regex, '<mark style="background: #ffeb3b; padding: 2px 4px; border-radius: 2px;">$1</mark>');
      const wrapper = document.createElement('span');
      wrapper.innerHTML = highlighted;
      textNode.parentNode.replaceChild(wrapper, textNode);
    }
  });
}

// 显示上下文帮助（在特定页面显示相关帮助）
export function showContextHelp(section) {
  const helpMap = {
    'projects': 'project',
    'customers': 'customer',
    'kpi': 'kpi',
    'finance': 'finance',
    'expense': 'expense',
    'express': 'express',
    'officeSupply': 'officeSupply',
    'seal': 'seal'
  };
  
  const topicKey = helpMap[section];
  if (topicKey) {
    showSection('help');
    setTimeout(() => {
      showHelpTopic(topicKey);
    }, 100);
  } else {
    showSection('help');
  }
}

