/**
 * 历史记录存储
 *
 * 每次成功生成拼豆图都会在此登记一条记录，便于前端「历史记录」管理：
 *   加载（回到预览/导出）、重命名、删除（同时清理矩阵与预览图文件）。
 *
 * 索引保存在项目根 data/history.json（非静态目录，不会外泄）。
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAll() {
  ensureDir();
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('读取历史记录失败:', e.message);
    return [];
  }
}

function saveAll(list) {
  ensureDir();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2));
}

/** 新增一条历史（最新在前） */
function add(record) {
  const list = loadAll();
  list.unshift(record);
  saveAll(list);
  return record;
}

/** 删除一条历史（仅索引），返回是否真的删除了 */
function remove(resultId) {
  const list = loadAll();
  const next = list.filter(r => r.resultId !== resultId);
  const changed = next.length !== list.length;
  if (changed) saveAll(next);
  return changed;
}

/** 重命名（name 长度上限 60） */
function rename(resultId, name) {
  const list = loadAll();
  const rec = list.find(r => r.resultId === resultId);
  if (!rec) return null;
  rec.name = String(name || '').slice(0, 60);
  saveAll(list);
  return rec;
}

function get(resultId) {
  return loadAll().find(r => r.resultId === resultId) || null;
}

module.exports = { add, remove, rename, get, listAll: loadAll };
