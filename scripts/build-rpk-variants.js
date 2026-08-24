const fs = require("fs")
const path = require("path")
const childProcess = require("child_process")

const root = path.resolve(__dirname, "..")
const variantsRoot = path.join(path.dirname(root), ".hyperbilibili-variants")
const outputDir = path.join(root, "artifacts")
const fullWorkspace = path.join(variantsRoot, "with-toolbox")
const liteWorkspace = path.join(variantsRoot, "without-toolbox")
const requestedDesignWidth = Number(process.env.VARIANT_DESIGN_WIDTH || 0)

function run(command, cwd) {
  console.log("\n> " + command)
  childProcess.execSync(command, {cwd, stdio: "inherit", shell: "/bin/bash"})
}

function resetDirectory(target) {
  fs.rmSync(target, {recursive: true, force: true})
  fs.mkdirSync(target, {recursive: true})
}

function copyProject(target) {
  childProcess.execFileSync("git", ["clone", "--no-hardlinks", root, target], {stdio: "inherit"})
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8")
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, value, "utf8")
}

function applyDesignWidth(workspace) {
  if (!Number.isFinite(requestedDesignWidth) || requestedDesignWidth <= 0) return
  const manifestPath = path.join(workspace, "src", "manifest.json")
  const manifest = JSON.parse(readText(manifestPath))
  manifest.config = manifest.config || {}
  manifest.config.designWidth = requestedDesignWidth
  writeText(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
}

function updateManifestForLite(workspace) {
  const manifestPath = path.join(workspace, "src", "manifest.json")
  const manifest = JSON.parse(readText(manifestPath))
  manifest.package = manifest.package + ".lite"
  manifest.name = manifest.name + " Lite"
  manifest.versionName = manifest.versionName + "-lite"
  const pages = manifest.router && manifest.router.pages ? manifest.router.pages : {}
  Object.keys(pages).forEach((pageName) => {
    if (
      pageName === "pages/app/features/toolbox" ||
      pageName.indexOf("pages/app/features/toolbox/") === 0
    ) {
      delete pages[pageName]
    }
  })
  writeText(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
}

function removeToolboxEntry(workspace) {
  const pagePath = path.join(workspace, "src", "pages", "app", "arealist", "arealist.ux")
  const lessPath = path.join(workspace, "src", "pages", "app", "arealist", "arealist.less")
  let page = readText(pagePath)
  const toolboxBlock = `                <div class="smallbtn" style="margin-left: 18px; background-color: {{colors.toolbox}}" onclick="OpenToolbox">
                    <div class="toolbox-entry-icon"><text class="toolbox-entry-icon-text">工</text></div>
                    <text class="smallbtntext">{{ $t("arealist.toolbox") }}</text>
                </div>
`
  if (!page.includes(toolboxBlock)) throw new Error("未找到工具箱首页入口，已停止生成精简包。")
  page = page.replace(toolboxBlock, "")
  page = page.replace('            toolbox: "#222222"\n', "")
  page = page.replace(/\n    OpenToolbox\(\)\{[\s\S]*?\n    \},\n    GoPage\(/, "\n    GoPage(")
  if (page.includes("OpenToolbox") || page.includes("colors.toolbox"))
    throw new Error("工具箱入口清理不完整，已停止生成精简包。")
  writeText(pagePath, page)

  let less = readText(lessPath)
  less = less.replace(
    /\n\.toolbox-entry-icon \{[\s\S]*?\n\}\n\.toolbox-entry-icon-text \{[\s\S]*?\n\}\n/,
    "\n"
  )
  writeText(lessPath, less)
}

function removeToolboxFeatureFiles(workspace) {
  const toolboxPath = path.join(workspace, "src", "pages", "app", "features", "toolbox")
  fs.rmSync(toolboxPath, {recursive: true, force: true})
  ;["weather.ts", "ai.ts", "game2048.ts"].forEach((fileName) => {
    fs.rmSync(path.join(workspace, "src", fileName), {force: true})
  })
}

function findRpk(directory) {
  const matches = []
  function visit(current) {
    fs.readdirSync(current, {withFileTypes: true}).forEach((entry) => {
      const next = path.join(current, entry.name)
      if (entry.isDirectory()) visit(next)
      else if (entry.isFile() && entry.name.endsWith(".rpk")) matches.push(next)
    })
  }
  visit(directory)
  if (matches.length !== 1)
    throw new Error("预期在 " + directory + " 找到一个 RPK，实际找到 " + matches.length + " 个。")
  return matches[0]
}

function buildWorkspace(workspace, outputName) {
  run("yarn install --frozen-lockfile", workspace)
  run("yarn build", workspace)
  const distPath = path.join(workspace, "dist")
  if (!fs.existsSync(distPath)) throw new Error("构建未生成 dist 目录：" + workspace)
  const rpk = findRpk(distPath)
  const destination = path.join(outputDir, outputName)
  fs.copyFileSync(rpk, destination)
  console.log("已生成: " + destination)
}

resetDirectory(variantsRoot)
resetDirectory(outputDir)

copyProject(fullWorkspace)
applyDesignWidth(fullWorkspace)
buildWorkspace(fullWorkspace, "HyperBilibili-Next-with-toolbox.rpk")

copyProject(liteWorkspace)
applyDesignWidth(liteWorkspace)
updateManifestForLite(liteWorkspace)
removeToolboxEntry(liteWorkspace)
removeToolboxFeatureFiles(liteWorkspace)
buildWorkspace(liteWorkspace, "HyperBilibili-Next-without-toolbox.rpk")

console.log("\n双变体构建完成：")
fs.readdirSync(outputDir).forEach((fileName) => console.log(path.join(outputDir, fileName)))
