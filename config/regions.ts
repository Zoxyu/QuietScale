/**
 * config/regions.ts —— 全国省市配置（城市选择的单一真相源）
 *
 * 约定：
 * 1. 收录全部 34 个省级行政区；各省下辖地级市完整列出，
 *    尚未接入参考价数据的城市以注释形式保留，接入数据源后取消注释即可启用；
 * 2. 选择器只列出「配置中未注释」的城市（ACTIVE_PROVINCES 自动派生），
 *    因此新增城市 = 取消注释 + 接入数据，无需改动页面代码；
 * 3. 当前启用：福州（官方数据源已接入）+ 北京（本地基线校验测试城市，
 *    用于验证「网络无法获取最新数据时降级本地基线」链路）；
 * 4. cityCode 必须与价格数据（mock/prices.ts、dist/prices.json）中的 cityCode 一致。
 */

/** 单个城市配置 */
export interface CityConfig {
  /** 城市唯一键 */
  key: string;
  /** 城市名（展示用） */
  name: string;
  /** 行政区划码（与价格数据 cityCode 对齐） */
  cityCode: string;
}

/** 单个省级行政区配置 */
export interface ProvinceConfig {
  /** 省唯一键 */
  key: string;
  /** 省名（展示用） */
  name: string;
  /** 该省已启用的城市列表（未接入数据的城市保持注释） */
  cities: CityConfig[];
}

/**
 * 全部省市配置。
 * 接入新城市三步：取消对应城市注释 → 实现该城市数据源 Adapter → 重新生成数据。
 */
export const PROVINCES: ProvinceConfig[] = [
  {
    key: 'fujian',
    name: '福建省',
    cities: [
      /** 官方数据源已接入（福州市发改委「主副食品集超均价表」） */
      { key: 'fuzhou', name: '福州市', cityCode: '350100' }
      // { key: 'xiamen', name: '厦门市', cityCode: '350200' },
      // { key: 'putian', name: '莆田市', cityCode: '350300' },
      // { key: 'sanming', name: '三明市', cityCode: '350400' },
      // { key: 'quanzhou', name: '泉州市', cityCode: '350500' },
      // { key: 'zhangzhou', name: '漳州市', cityCode: '350600' },
      // { key: 'nanping', name: '南平市', cityCode: '350700' },
      // { key: 'longyan', name: '龙岩市', cityCode: '350800' },
      // { key: 'ningde', name: '宁德市', cityCode: '350900' }
    ]
  },
  {
    key: 'beijing',
    name: '北京市',
    cities: [
      /**
       * 本地基线校验测试城市：
       * 网络无法获取最新数据时，降级链路由 mock/prices.ts 的北京基线数据兜底，
       * 选择北京即可验证降级展示是否正常。
       */
      { key: 'beijing', name: '北京市', cityCode: '110000' }
    ]
  },
  {
    key: 'tianjin',
    name: '天津市',
    cities: [
      // { key: 'tianjin', name: '天津市', cityCode: '120000' }
    ]
  },
  {
    key: 'hebei',
    name: '河北省',
    cities: [
      // { key: 'shijiazhuang', name: '石家庄市', cityCode: '130100' },
      // { key: 'tangshan', name: '唐山市', cityCode: '130200' },
      // { key: 'qinhuangdao', name: '秦皇岛市', cityCode: '130300' },
      // { key: 'handan', name: '邯郸市', cityCode: '130400' },
      // { key: 'xingtai', name: '邢台市', cityCode: '130500' },
      // { key: 'baoding', name: '保定市', cityCode: '130600' },
      // { key: 'zhangjiakou', name: '张家口市', cityCode: '130700' },
      // { key: 'chengde', name: '承德市', cityCode: '130800' },
      // { key: 'cangzhou', name: '沧州市', cityCode: '130900' },
      // { key: 'langfang', name: '廊坊市', cityCode: '131000' },
      // { key: 'hengshui', name: '衡水市', cityCode: '131100' }
    ]
  },
  {
    key: 'shanxi',
    name: '山西省',
    cities: [
      // { key: 'taiyuan', name: '太原市', cityCode: '140100' },
      // { key: 'datong', name: '大同市', cityCode: '140200' },
      // { key: 'yangquan', name: '阳泉市', cityCode: '140300' },
      // { key: 'changzhi', name: '长治市', cityCode: '140400' },
      // { key: 'jincheng', name: '晋城市', cityCode: '140500' },
      // { key: 'shuozhou', name: '朔州市', cityCode: '140600' },
      // { key: 'jinzhong', name: '晋中市', cityCode: '140700' },
      // { key: 'yuncheng', name: '运城市', cityCode: '140800' },
      // { key: 'xinzhou', name: '忻州市', cityCode: '140900' },
      // { key: 'linfen', name: '临汾市', cityCode: '141000' },
      // { key: 'lvliang', name: '吕梁市', cityCode: '141100' }
    ]
  },
  {
    key: 'neimenggu',
    name: '内蒙古自治区',
    cities: [
      // { key: 'hohhot', name: '呼和浩特市', cityCode: '150100' },
      // { key: 'baotou', name: '包头市', cityCode: '150200' },
      // { key: 'wuhai', name: '乌海市', cityCode: '150300' },
      // { key: 'chifeng', name: '赤峰市', cityCode: '150400' },
      // { key: 'tongliao', name: '通辽市', cityCode: '150500' },
      // { key: 'ordos', name: '鄂尔多斯市', cityCode: '150600' },
      // { key: 'hulunbuir', name: '呼伦贝尔市', cityCode: '150700' },
      // { key: 'bayannur', name: '巴彦淖尔市', cityCode: '150800' },
      // { key: 'ulanqab', name: '乌兰察布市', cityCode: '150900' },
      // { key: 'xingan', name: '兴安盟', cityCode: '152200' },
      // { key: 'xilingol', name: '锡林郭勒盟', cityCode: '152500' },
      // { key: 'alxa', name: '阿拉善盟', cityCode: '152900' }
    ]
  },
  {
    key: 'liaoning',
    name: '辽宁省',
    cities: [
      // { key: 'shenyang', name: '沈阳市', cityCode: '210100' },
      // { key: 'dalian', name: '大连市', cityCode: '210200' },
      // { key: 'anshan', name: '鞍山市', cityCode: '210300' },
      // { key: 'fushun', name: '抚顺市', cityCode: '210400' },
      // { key: 'benxi', name: '本溪市', cityCode: '210500' },
      // { key: 'dandong', name: '丹东市', cityCode: '210600' },
      // { key: 'jinzhou', name: '锦州市', cityCode: '210700' },
      // { key: 'yingkou', name: '营口市', cityCode: '210800' },
      // { key: 'fuxin', name: '阜新市', cityCode: '210900' },
      // { key: 'liaoyang', name: '辽阳市', cityCode: '211000' },
      // { key: 'panjin', name: '盘锦市', cityCode: '211100' },
      // { key: 'tieling', name: '铁岭市', cityCode: '211200' },
      // { key: 'chaoyang', name: '朝阳市', cityCode: '211300' },
      // { key: 'huludao', name: '葫芦岛市', cityCode: '211400' }
    ]
  },
  {
    key: 'jilin',
    name: '吉林省',
    cities: [
      // { key: 'changchun', name: '长春市', cityCode: '220100' },
      // { key: 'jilin', name: '吉林市', cityCode: '220200' },
      // { key: 'siping', name: '四平市', cityCode: '220300' },
      // { key: 'liaoyuan', name: '辽源市', cityCode: '220400' },
      // { key: 'tonghua', name: '通化市', cityCode: '220500' },
      // { key: 'baishan', name: '白山市', cityCode: '220600' },
      // { key: 'songyuan', name: '松原市', cityCode: '220700' },
      // { key: 'baicheng', name: '白城市', cityCode: '220800' },
      // { key: 'yanbian', name: '延边朝鲜族自治州', cityCode: '222400' }
    ]
  },
  {
    key: 'heilongjiang',
    name: '黑龙江省',
    cities: [
      // { key: 'harbin', name: '哈尔滨市', cityCode: '230100' },
      // { key: 'qiqihar', name: '齐齐哈尔市', cityCode: '230200' },
      // { key: 'jixi', name: '鸡西市', cityCode: '230300' },
      // { key: 'hegang', name: '鹤岗市', cityCode: '230400' },
      // { key: 'shuangyashan', name: '双鸭山市', cityCode: '230500' },
      // { key: 'daqing', name: '大庆市', cityCode: '230600' },
      // { key: 'yichun', name: '伊春市', cityCode: '230700' },
      // { key: 'jiamusi', name: '佳木斯市', cityCode: '230800' },
      // { key: 'qitaihe', name: '七台河市', cityCode: '230900' },
      // { key: 'mudanjiang', name: '牡丹江市', cityCode: '231000' },
      // { key: 'heihe', name: '黑河市', cityCode: '231100' },
      // { key: 'suihua', name: '绥化市', cityCode: '231200' },
      // { key: 'daxinganling', name: '大兴安岭地区', cityCode: '232700' }
    ]
  },
  {
    key: 'shanghai',
    name: '上海市',
    cities: [
      // { key: 'shanghai', name: '上海市', cityCode: '310000' }
    ]
  },
  {
    key: 'jiangsu',
    name: '江苏省',
    cities: [
      // { key: 'nanjing', name: '南京市', cityCode: '320100' },
      // { key: 'wuxi', name: '无锡市', cityCode: '320200' },
      // { key: 'xuzhou', name: '徐州市', cityCode: '320300' },
      // { key: 'changzhou', name: '常州市', cityCode: '320400' },
      // { key: 'suzhou', name: '苏州市', cityCode: '320500' },
      // { key: 'nantong', name: '南通市', cityCode: '320600' },
      // { key: 'lianyungang', name: '连云港市', cityCode: '320700' },
      // { key: 'huaian', name: '淮安市', cityCode: '320800' },
      // { key: 'yancheng', name: '盐城市', cityCode: '320900' },
      // { key: 'yangzhou', name: '扬州市', cityCode: '321000' },
      // { key: 'zhenjiang', name: '镇江市', cityCode: '321100' },
      // { key: 'taizhou', name: '泰州市', cityCode: '321200' },
      // { key: 'suqian', name: '宿迁市', cityCode: '321300' }
    ]
  },
  {
    key: 'zhejiang',
    name: '浙江省',
    cities: [
      // { key: 'hangzhou', name: '杭州市', cityCode: '330100' },
      // { key: 'ningbo', name: '宁波市', cityCode: '330200' },
      // { key: 'wenzhou', name: '温州市', cityCode: '330300' },
      // { key: 'jiaxing', name: '嘉兴市', cityCode: '330400' },
      // { key: 'huzhou', name: '湖州市', cityCode: '330500' },
      // { key: 'shaoxing', name: '绍兴市', cityCode: '330600' },
      // { key: 'jinhua', name: '金华市', cityCode: '330700' },
      // { key: 'quzhou', name: '衢州市', cityCode: '330800' },
      // { key: 'zhoushan', name: '舟山市', cityCode: '330900' },
      // { key: 'taizhou-zj', name: '台州市', cityCode: '331000' },
      // { key: 'lishui', name: '丽水市', cityCode: '331100' }
    ]
  },
  {
    key: 'anhui',
    name: '安徽省',
    cities: [
      // { key: 'hefei', name: '合肥市', cityCode: '340100' },
      // { key: 'wuhu', name: '芜湖市', cityCode: '340200' },
      // { key: 'bengbu', name: '蚌埠市', cityCode: '340300' },
      // { key: 'huainan', name: '淮南市', cityCode: '340400' },
      // { key: 'maanshan', name: '马鞍山市', cityCode: '340500' },
      // { key: 'huaibei', name: '淮北市', cityCode: '340600' },
      // { key: 'tongling', name: '铜陵市', cityCode: '340700' },
      // { key: 'anqing', name: '安庆市', cityCode: '340800' },
      // { key: 'huangshan', name: '黄山市', cityCode: '341000' },
      // { key: 'chuzhou', name: '滁州市', cityCode: '341100' },
      // { key: 'fuyang', name: '阜阳市', cityCode: '341200' },
      // { key: 'suzhou-ah', name: '宿州市', cityCode: '341300' },
      // { key: 'luan', name: '六安市', cityCode: '341500' },
      // { key: 'bozhou', name: '亳州市', cityCode: '341600' },
      // { key: 'chizhou', name: '池州市', cityCode: '341700' },
      // { key: 'xuancheng', name: '宣城市', cityCode: '341800' }
    ]
  },
  {
    key: 'jiangxi',
    name: '江西省',
    cities: [
      // { key: 'nanchang', name: '南昌市', cityCode: '360100' },
      // { key: 'jingdezhen', name: '景德镇市', cityCode: '360200' },
      // { key: 'pingxiang', name: '萍乡市', cityCode: '360300' },
      // { key: 'jiujiang', name: '九江市', cityCode: '360400' },
      // { key: 'xinyu', name: '新余市', cityCode: '360500' },
      // { key: 'yingtan', name: '鹰潭市', cityCode: '360600' },
      // { key: 'ganzhou', name: '赣州市', cityCode: '360700' },
      // { key: 'jian', name: '吉安市', cityCode: '360800' },
      // { key: 'yichun-jx', name: '宜春市', cityCode: '360900' },
      // { key: 'fuzhou-jx', name: '抚州市', cityCode: '361000' },
      // { key: 'shangrao', name: '上饶市', cityCode: '361100' }
    ]
  },
  {
    key: 'shandong',
    name: '山东省',
    cities: [
      // { key: 'jinan', name: '济南市', cityCode: '370100' },
      // { key: 'qingdao', name: '青岛市', cityCode: '370200' },
      // { key: 'zibo', name: '淄博市', cityCode: '370300' },
      // { key: 'zaozhuang', name: '枣庄市', cityCode: '370400' },
      // { key: 'dongying', name: '东营市', cityCode: '370500' },
      // { key: 'yantai', name: '烟台市', cityCode: '370600' },
      // { key: 'weifang', name: '潍坊市', cityCode: '370700' },
      // { key: 'jining', name: '济宁市', cityCode: '370800' },
      // { key: 'taian', name: '泰安市', cityCode: '370900' },
      // { key: 'weihai', name: '威海市', cityCode: '371000' },
      // { key: 'rizhao', name: '日照市', cityCode: '371100' },
      // { key: 'linyi', name: '临沂市', cityCode: '371300' },
      // { key: 'dezhou', name: '德州市', cityCode: '371400' },
      // { key: 'liaocheng', name: '聊城市', cityCode: '371500' },
      // { key: 'binzhou', name: '滨州市', cityCode: '371600' },
      // { key: 'heze', name: '菏泽市', cityCode: '371700' }
    ]
  },
  {
    key: 'henan',
    name: '河南省',
    cities: [
      // { key: 'zhengzhou', name: '郑州市', cityCode: '410100' },
      // { key: 'kaifeng', name: '开封市', cityCode: '410200' },
      // { key: 'luoyang', name: '洛阳市', cityCode: '410300' },
      // { key: 'pingdingshan', name: '平顶山市', cityCode: '410400' },
      // { key: 'anyang', name: '安阳市', cityCode: '410500' },
      // { key: 'hebi', name: '鹤壁市', cityCode: '410600' },
      // { key: 'xinxiang', name: '新乡市', cityCode: '410700' },
      // { key: 'jiaozuo', name: '焦作市', cityCode: '410800' },
      // { key: 'puyang', name: '濮阳市', cityCode: '410900' },
      // { key: 'xuchang', name: '许昌市', cityCode: '411000' },
      // { key: 'luohe', name: '漯河市', cityCode: '411100' },
      // { key: 'sanmenxia', name: '三门峡市', cityCode: '411200' },
      // { key: 'nanyang', name: '南阳市', cityCode: '411300' },
      // { key: 'shangqiu', name: '商丘市', cityCode: '411400' },
      // { key: 'xinyang', name: '信阳市', cityCode: '411500' },
      // { key: 'zhoukou', name: '周口市', cityCode: '411600' },
      // { key: 'zhumadian', name: '驻马店市', cityCode: '411700' },
      // { key: 'jiyuan', name: '济源市', cityCode: '419001' }
    ]
  },
  {
    key: 'hubei',
    name: '湖北省',
    cities: [
      // { key: 'wuhan', name: '武汉市', cityCode: '420100' },
      // { key: 'huangshi', name: '黄石市', cityCode: '420200' },
      // { key: 'shiyan', name: '十堰市', cityCode: '420300' },
      // { key: 'yichang', name: '宜昌市', cityCode: '420500' },
      // { key: 'xiangyang', name: '襄阳市', cityCode: '420600' },
      // { key: 'ezhou', name: '鄂州市', cityCode: '420700' },
      // { key: 'jingmen', name: '荆门市', cityCode: '420800' },
      // { key: 'xiaogan', name: '孝感市', cityCode: '420900' },
      // { key: 'jingzhou', name: '荆州市', cityCode: '421000' },
      // { key: 'huanggang', name: '黄冈市', cityCode: '421100' },
      // { key: 'xianning', name: '咸宁市', cityCode: '421200' },
      // { key: 'suizhou', name: '随州市', cityCode: '421300' },
      // { key: 'enshi', name: '恩施土家族苗族自治州', cityCode: '422800' }
    ]
  },
  {
    key: 'hunan',
    name: '湖南省',
    cities: [
      // { key: 'changsha', name: '长沙市', cityCode: '430100' },
      // { key: 'zhuzhou', name: '株洲市', cityCode: '430200' },
      // { key: 'xiangtan', name: '湘潭市', cityCode: '430300' },
      // { key: 'hengyang', name: '衡阳市', cityCode: '430400' },
      // { key: 'shaoyang', name: '邵阳市', cityCode: '430500' },
      // { key: 'yueyang', name: '岳阳市', cityCode: '430600' },
      // { key: 'changde', name: '常德市', cityCode: '430700' },
      // { key: 'zhangjiajie', name: '张家界市', cityCode: '430800' },
      // { key: 'yiyang', name: '益阳市', cityCode: '430900' },
      // { key: 'chenzhou', name: '郴州市', cityCode: '431000' },
      // { key: 'yongzhou', name: '永州市', cityCode: '431100' },
      // { key: 'huaihua', name: '怀化市', cityCode: '431200' },
      // { key: 'loudi', name: '娄底市', cityCode: '431300' },
      // { key: 'xiangxi', name: '湘西土家族苗族自治州', cityCode: '433100' }
    ]
  },
  {
    key: 'guangdong',
    name: '广东省',
    cities: [
      // { key: 'guangzhou', name: '广州市', cityCode: '440100' },
      // { key: 'shaoguan', name: '韶关市', cityCode: '440200' },
      // { key: 'shenzhen', name: '深圳市', cityCode: '440300' },
      // { key: 'zhuhai', name: '珠海市', cityCode: '440400' },
      // { key: 'shantou', name: '汕头市', cityCode: '440500' },
      // { key: 'foshan', name: '佛山市', cityCode: '440600' },
      // { key: 'jiangmen', name: '江门市', cityCode: '440700' },
      // { key: 'zhanjiang', name: '湛江市', cityCode: '440800' },
      // { key: 'maoming', name: '茂名市', cityCode: '440900' },
      // { key: 'zhaoqing', name: '肇庆市', cityCode: '441200' },
      // { key: 'huizhou', name: '惠州市', cityCode: '441300' },
      // { key: 'meizhou', name: '梅州市', cityCode: '441400' },
      // { key: 'shanwei', name: '汕尾市', cityCode: '441500' },
      // { key: 'heyuan', name: '河源市', cityCode: '441600' },
      // { key: 'yangjiang', name: '阳江市', cityCode: '441700' },
      // { key: 'qingyuan', name: '清远市', cityCode: '441800' },
      // { key: 'dongguan', name: '东莞市', cityCode: '441900' },
      // { key: 'zhongshan', name: '中山市', cityCode: '442000' },
      // { key: 'chaozhou', name: '潮州市', cityCode: '445100' },
      // { key: 'jieyang', name: '揭阳市', cityCode: '445200' },
      // { key: 'yunfu', name: '云浮市', cityCode: '445300' }
    ]
  },
  {
    key: 'guangxi',
    name: '广西壮族自治区',
    cities: [
      // { key: 'nanning', name: '南宁市', cityCode: '450100' },
      // { key: 'liuzhou', name: '柳州市', cityCode: '450200' },
      // { key: 'guilin', name: '桂林市', cityCode: '450300' },
      // { key: 'wuzhou', name: '梧州市', cityCode: '450400' },
      // { key: 'beihai', name: '北海市', cityCode: '450500' },
      // { key: 'fangchenggang', name: '防城港市', cityCode: '450600' },
      // { key: 'qinzhou', name: '钦州市', cityCode: '450700' },
      // { key: 'guigang', name: '贵港市', cityCode: '450800' },
      // { key: 'yulin-gx', name: '玉林市', cityCode: '450900' },
      // { key: 'baise', name: '百色市', cityCode: '451000' },
      // { key: 'hezhou', name: '贺州市', cityCode: '451100' },
      // { key: 'hechi', name: '河池市', cityCode: '451200' },
      // { key: 'laibin', name: '来宾市', cityCode: '451300' },
      // { key: 'chongzuo', name: '崇左市', cityCode: '451400' }
    ]
  },
  {
    key: 'hainan',
    name: '海南省',
    cities: [
      // { key: 'haikou', name: '海口市', cityCode: '460100' },
      // { key: 'sanya', name: '三亚市', cityCode: '460200' },
      // { key: 'sansha', name: '三沙市', cityCode: '460300' },
      // { key: 'danzhou', name: '儋州市', cityCode: '460400' }
    ]
  },
  {
    key: 'chongqing',
    name: '重庆市',
    cities: [
      // { key: 'chongqing', name: '重庆市', cityCode: '500000' }
    ]
  },
  {
    key: 'sichuan',
    name: '四川省',
    cities: [
      // { key: 'chengdu', name: '成都市', cityCode: '510100' },
      // { key: 'zigong', name: '自贡市', cityCode: '510300' },
      // { key: 'panzhihua', name: '攀枝花市', cityCode: '510400' },
      // { key: 'luzhou', name: '泸州市', cityCode: '510500' },
      // { key: 'deyang', name: '德阳市', cityCode: '510600' },
      // { key: 'mianyang', name: '绵阳市', cityCode: '510700' },
      // { key: 'guangyuan', name: '广元市', cityCode: '510800' },
      // { key: 'suining', name: '遂宁市', cityCode: '510900' },
      // { key: 'neijiang', name: '内江市', cityCode: '511000' },
      // { key: 'leshan', name: '乐山市', cityCode: '511100' },
      // { key: 'nanchong', name: '南充市', cityCode: '511300' },
      // { key: 'meishan', name: '眉山市', cityCode: '511400' },
      // { key: 'yibin', name: '宜宾市', cityCode: '511500' },
      // { key: 'guangan', name: '广安市', cityCode: '511600' },
      // { key: 'dazhou', name: '达州市', cityCode: '511700' },
      // { key: 'yaan', name: '雅安市', cityCode: '511800' },
      // { key: 'bazhong', name: '巴中市', cityCode: '511900' },
      // { key: 'ziyang', name: '资阳市', cityCode: '512000' },
      // { key: 'aba', name: '阿坝藏族羌族自治州', cityCode: '513200' },
      // { key: 'ganzi', name: '甘孜藏族自治州', cityCode: '513300' },
      // { key: 'liangshan', name: '凉山彝族自治州', cityCode: '513400' }
    ]
  },
  {
    key: 'guizhou',
    name: '贵州省',
    cities: [
      // { key: 'guiyang', name: '贵阳市', cityCode: '520100' },
      // { key: 'liupanshui', name: '六盘水市', cityCode: '520200' },
      // { key: 'zunyi', name: '遵义市', cityCode: '520300' },
      // { key: 'anshun', name: '安顺市', cityCode: '520400' },
      // { key: 'bijie', name: '毕节市', cityCode: '520500' },
      // { key: 'tongren', name: '铜仁市', cityCode: '520600' },
      // { key: 'qianxinan', name: '黔西南布依族苗族自治州', cityCode: '522300' },
      // { key: 'qiandongnan', name: '黔东南苗族侗族自治州', cityCode: '522600' },
      // { key: 'qiannan', name: '黔南布依族苗族自治州', cityCode: '522700' }
    ]
  },
  {
    key: 'yunnan',
    name: '云南省',
    cities: [
      // { key: 'kunming', name: '昆明市', cityCode: '530100' },
      // { key: 'qujing', name: '曲靖市', cityCode: '530300' },
      // { key: 'yuxi', name: '玉溪市', cityCode: '530400' },
      // { key: 'baoshan', name: '保山市', cityCode: '530500' },
      // { key: 'zhaotong', name: '昭通市', cityCode: '530600' },
      // { key: 'lijiang', name: '丽江市', cityCode: '530700' },
      // { key: 'puer', name: '普洱市', cityCode: '530800' },
      // { key: 'lincang', name: '临沧市', cityCode: '530900' },
      // { key: 'chuxiong', name: '楚雄彝族自治州', cityCode: '532300' },
      // { key: 'honghe', name: '红河哈尼族彝族自治州', cityCode: '532500' },
      // { key: 'wenshan', name: '文山壮族苗族自治州', cityCode: '532600' },
      // { key: 'xishuangbanna', name: '西双版纳傣族自治州', cityCode: '532800' },
      // { key: 'dali', name: '大理白族自治州', cityCode: '532900' },
      // { key: 'dehong', name: '德宏傣族景颇族自治州', cityCode: '533100' },
      // { key: 'nujiang', name: '怒江傈僳族自治州', cityCode: '533300' },
      // { key: 'diqing', name: '迪庆藏族自治州', cityCode: '533400' }
    ]
  },
  {
    key: 'xizang',
    name: '西藏自治区',
    cities: [
      // { key: 'lasa', name: '拉萨市', cityCode: '540100' },
      // { key: 'rikaze', name: '日喀则市', cityCode: '540200' },
      // { key: 'changdu', name: '昌都市', cityCode: '540300' },
      // { key: 'linzhi', name: '林芝市', cityCode: '540400' },
      // { key: 'shannan', name: '山南市', cityCode: '540500' },
      // { key: 'naqu', name: '那曲市', cityCode: '540600' },
      // { key: 'ali', name: '阿里地区', cityCode: '542500' }
    ]
  },
  {
    key: 'shaanxi',
    name: '陕西省',
    cities: [
      // { key: 'xian', name: '西安市', cityCode: '610100' },
      // { key: 'tongchuan', name: '铜川市', cityCode: '610200' },
      // { key: 'baoji', name: '宝鸡市', cityCode: '610300' },
      // { key: 'xianyang', name: '咸阳市', cityCode: '610400' },
      // { key: 'weinan', name: '渭南市', cityCode: '610500' },
      // { key: 'yanan', name: '延安市', cityCode: '610600' },
      // { key: 'hanzhong', name: '汉中市', cityCode: '610700' },
      // { key: 'yulin-sx', name: '榆林市', cityCode: '610800' },
      // { key: 'ankang', name: '安康市', cityCode: '610900' },
      // { key: 'shangluo', name: '商洛市', cityCode: '611000' }
    ]
  },
  {
    key: 'gansu',
    name: '甘肃省',
    cities: [
      // { key: 'lanzhou', name: '兰州市', cityCode: '620100' },
      // { key: 'jiayuguan', name: '嘉峪关市', cityCode: '620200' },
      // { key: 'jinchang', name: '金昌市', cityCode: '620300' },
      // { key: 'baiyin', name: '白银市', cityCode: '620400' },
      // { key: 'tianshui', name: '天水市', cityCode: '620500' },
      // { key: 'wuwei', name: '武威市', cityCode: '620600' },
      // { key: 'zhangye', name: '张掖市', cityCode: '620700' },
      // { key: 'pingliang', name: '平凉市', cityCode: '620800' },
      // { key: 'jiuquan', name: '酒泉市', cityCode: '620900' },
      // { key: 'qingyang', name: '庆阳市', cityCode: '621000' },
      // { key: 'dingxi', name: '定西市', cityCode: '621100' },
      // { key: 'longnan', name: '陇南市', cityCode: '621200' },
      // { key: 'linxia', name: '临夏回族自治州', cityCode: '622900' },
      // { key: 'gannan', name: '甘南藏族自治州', cityCode: '623000' }
    ]
  },
  {
    key: 'qinghai',
    name: '青海省',
    cities: [
      // { key: 'xining', name: '西宁市', cityCode: '630100' },
      // { key: 'haidong', name: '海东市', cityCode: '630200' },
      // { key: 'haibei', name: '海北藏族自治州', cityCode: '632200' },
      // { key: 'huangnan', name: '黄南藏族自治州', cityCode: '632300' },
      // { key: 'hainan-qh', name: '海南藏族自治州', cityCode: '632500' },
      // { key: 'guoluo', name: '果洛藏族自治州', cityCode: '632600' },
      // { key: 'yushu', name: '玉树藏族自治州', cityCode: '632700' },
      // { key: 'haixi', name: '海西蒙古族藏族自治州', cityCode: '632800' }
    ]
  },
  {
    key: 'ningxia',
    name: '宁夏回族自治区',
    cities: [
      // { key: 'yinchuan', name: '银川市', cityCode: '640100' },
      // { key: 'shizuishan', name: '石嘴山市', cityCode: '640200' },
      // { key: 'wuzhong', name: '吴忠市', cityCode: '640300' },
      // { key: 'guyuan', name: '固原市', cityCode: '640400' },
      // { key: 'zhongwei', name: '中卫市', cityCode: '640500' }
    ]
  },
  {
    key: 'xinjiang',
    name: '新疆维吾尔自治区',
    cities: [
      // { key: 'urumqi', name: '乌鲁木齐市', cityCode: '650100' },
      // { key: 'karamay', name: '克拉玛依市', cityCode: '650200' },
      // { key: 'tulufan', name: '吐鲁番市', cityCode: '650400' },
      // { key: 'hami', name: '哈密市', cityCode: '650500' },
      // { key: 'changji', name: '昌吉回族自治州', cityCode: '652300' },
      // { key: 'boertala', name: '博尔塔拉蒙古自治州', cityCode: '652700' },
      // { key: 'bayinguoleng', name: '巴音郭楞蒙古自治州', cityCode: '652800' },
      // { key: 'akesu', name: '阿克苏地区', cityCode: '652900' },
      // { key: 'kezilesu', name: '克孜勒苏柯尔克孜自治州', cityCode: '653000' },
      // { key: 'kashi', name: '喀什地区', cityCode: '653100' },
      // { key: 'hetian', name: '和田地区', cityCode: '653200' },
      // { key: 'yili', name: '伊犁哈萨克自治州', cityCode: '654000' },
      // { key: 'tacheng', name: '塔城地区', cityCode: '654200' },
      // { key: 'aletai', name: '阿勒泰地区', cityCode: '654300' }
    ]
  },
  {
    key: 'xianggang',
    name: '中国香港',
    cities: [
      // { key: 'hongkong', name: '中国香港', cityCode: '810000' }
    ]
  },
  {
    key: 'aomen',
    name: '中国澳门',
    cities: [
      // { key: 'macao', name: '中国澳门', cityCode: '820000' }
    ]
  },
  {
    key: 'taiwan',
    name: '中国台湾',
    cities: [
      // { key: 'taipei', name: '台北市', cityCode: '710100' },
      // { key: 'kaohsiung', name: '高雄市', cityCode: '710200' },
      // { key: 'keelung', name: '基隆市', cityCode: '710300' },
      // { key: 'taichung', name: '台中市', cityCode: '710400' },
      // { key: 'tainan', name: '台南市', cityCode: '710500' },
      // { key: 'hsinchu', name: '新竹市', cityCode: '710600' },
      // { key: 'chiayi', name: '嘉义市', cityCode: '710700' }
    ]
  }
];

/** 当前有可用城市的省（选择器只列出这些省，由配置自动派生） */
export const ACTIVE_PROVINCES: ProvinceConfig[] = PROVINCES.filter(
  (p) => p.cities.length > 0
);

/**
 * 已启用城市的中心坐标（供定位近似匹配；新增启用城市时同步补充）。
 * key 为 cityCode。
 */
export const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  /** 福州市 */
  '350100': { lat: 26.0745, lng: 119.2965 },
  /** 北京市 */
  '110000': { lat: 39.9042, lng: 116.4074 }
};
