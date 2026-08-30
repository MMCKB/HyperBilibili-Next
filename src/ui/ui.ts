import { router } from "../tsimports"

class GlobalActions {
    static AddToVmPool(vm){
        global.vmPool[vm._name] = vm
    }

    static UpdateCurrentPageName(){
        global.currentPageName = router.getState().name
    }

    static ClearCurrentVmSrcClass(){
        global.vmPool[global.currentPageName].scrclass = ""
    }
}

function runVmPoolGC(){
    for(var name in global.vmPool){
        if(global.vmPool[name]){
            if(global.vmPool[name].$valid){
                return
            }
        }

        global.logger.log("[ui.VmPoolGC] page named", name, " has been already destroyed.")
        delete global.vmPool[name]
    }
}

export function Init(){
    global.vmPool = {}
    global.currentPageName = ""
    global.logger.log("[ui.InitPage] inited.")

    setInterval(() => {
        runVmPoolGC()
    }, 10000)
}

export function InitPage(vm){
    GlobalActions.UpdateCurrentPageName()
    GlobalActions.AddToVmPool(vm)
    GlobalActions.ClearCurrentVmSrcClass()
    global.logger.log("[ui.InitPage] vm set successed. name=", global.currentPageName)
}

// 功能区（arealist）子页面：从功能区进入时是栈底页（router.clear + replace）
// 直接 router.back() 会退出应用，改为返回功能区，lastpage 用于高亮对应按钮
const MENU_BACK_PAGES = ["dynamic", "savedcontent", "mypage", "settings"]

export function OnBackPressTriggered(){
    GlobalActions.UpdateCurrentPageName()
    global.vmPool[global.currentPageName].scrclass = "scroll-backanim"
    setTimeout(() => {
        GlobalActions.ClearCurrentVmSrcClass()

        // 栈底的功能区子页：回功能区而不是退出应用
        var pageSeg = global.currentPageName.split("/").pop()
        if (pageSeg && MENU_BACK_PAGES.indexOf(pageSeg) >= 0) {
            router.replace({
                uri: "pages/app/arealist",
                params: {
                    lastpage: pageSeg
                }
            })
            return
        }

        router.back()

        var pageStack = router.getPages()
        if (pageStack.length < 2) return
        var lastPageName = pageStack[pageStack.length - 2].name
        global.logger.log("lastpage=", lastPageName, "currentPage=", global.currentPageName)
        global.vmPool[lastPageName].scrclass = ""
        global.vmPool[lastPageName].scrclass = "scroll-frombackanim"
    }, 150)
}