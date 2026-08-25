use astrobox_ng_wit::astrobox::psys_host::{device, dialog, interconnect, register, ui_v3 as ui};
use astrobox_ng_wit::exports::astrobox::psys_plugin::{event_v3 as event, event_v3::EventType, lifecycle};
use astrobox_ng_wit::FutureReader;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};
use std::sync::atomic::{AtomicU64, Ordering};

pub mod logger;

const TARGET_PACKAGE: &str = "com.mmckb.hyperbilibili";
const PICK_IMAGE_EVENT: &str = "pick-and-send";
const CHUNK_BYTES: usize = 2048;
const MAX_IMAGE_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone)]
struct PendingTransfer {
    id: String,
    name: String,
    mime: String,
    data: Vec<u8>,
    device_addr: String,
    next_chunk: usize,
}

struct PluginState {
    root_element_id: Option<String>,
    status: String,
    device_name: String,
    pending: Option<PendingTransfer>,
}

static PLUGIN_STATE: OnceLock<Mutex<PluginState>> = OnceLock::new();
static TRANSFER_SEQUENCE: AtomicU64 = AtomicU64::new(1);

fn state() -> &'static Mutex<PluginState> {
    PLUGIN_STATE.get_or_init(|| {
        Mutex::new(PluginState {
            root_element_id: None,
            status: "正在检查已连接手表…".into(),
            device_name: "未连接".into(),
            pending: None,
        })
    })
}

fn set_status(status: impl Into<String>) {
    let root = {
        let mut current = state().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        current.status = status.into();
        current.root_element_id.clone()
    };
    if let Some(root_element_id) = root {
        ui::render(&root_element_id, build_ui());
    }
}

fn set_device(name: impl Into<String>) {
    let root = {
        let mut current = state().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        current.device_name = name.into();
        current.root_element_id.clone()
    };
    if let Some(root_element_id) = root {
        ui::render(&root_element_id, build_ui());
    }
}

fn build_ui() -> ui::Element {
    let snapshot = state().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let title = ui::Element::new(ui::ElementType::P, Some("图库图片传输"))
        .size(28)
        .text_color("#FFFFFF");
    let explanation = ui::Element::new(
        ui::ElementType::P,
        Some("选择一张图片并传入已打开图库页面的手表。"),
    )
    .size(16)
    .text_color("#B8BBC7");
    let device_line = ui::Element::new(
        ui::ElementType::P,
        Some(format!("目标手表：{}", snapshot.device_name).as_str()),
    )
    .size(16)
    .text_color("#A9C8FF");
    let status_line = ui::Element::new(ui::ElementType::P, Some(snapshot.status.as_str()))
        .size(16)
        .text_color("#FFB1CA");
    let pick_button = ui::Element::new(ui::ElementType::Button, Some("选择图片并传输"))
        .bg("#F471A2")
        .text_color("#FFFFFF")
        .on(ui::Event::Click, PICK_IMAGE_EVENT);
    ui::Element::new(ui::ElementType::Div, None)
        .flex()
        .flex_direction(ui::FlexDirection::Column)
        .width_full()
        .justify_center()
        .align_center()
        .child(title)
        .child(explanation)
        .child(device_line)
        .child(status_line)
        .child(pick_button)
}

fn render_main_ui(element_id: &str) {
    {
        let mut current = state().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        current.root_element_id = Some(element_id.to_string());
    }
    ui::render(element_id, build_ui());
}

fn immediate_string() -> FutureReader<String> {
    let (writer, reader) = astrobox_ng_wit::wit_future::new::<String>(String::new);
    astrobox_ng_wit::spawn(async move { let _ = writer.write(String::new()).await; });
    reader
}

fn immediate_unit() -> FutureReader<()> {
    let (writer, reader) = astrobox_ng_wit::wit_future::new::<()>(|| ());
    astrobox_ng_wit::spawn(async move { let _ = writer.write(()).await; });
    reader
}

fn mime_for_name(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".png") { "image/png" }
    else if lower.ends_with(".webp") { "image/webp" }
    else if lower.ends_with(".gif") { "image/gif" }
    else { "image/jpeg" }
}

async fn refresh_device() -> Option<String> {
    let devices = device::get_connected_device_list().into_future().await;
    let Some(target) = devices.into_iter().next() else {
        set_device("未连接");
        set_status("未发现已连接的手表");
        return None;
    };
    let addr = target.addr.clone();
    set_device(target.name);
    match register::register_interconnect_recv(&addr, TARGET_PACKAGE).into_future().await {
        Ok(()) => set_status("已连接，请在手表图库页面保持接收状态"),
        Err(()) => set_status("无法注册手表图库消息通道"),
    }
    Some(addr)
}

async fn send_message(addr: &str, body: Value) -> Result<(), ()> {
    interconnect::send_qaic_message(addr, TARGET_PACKAGE, &body.to_string()).into_future().await
}

async fn choose_and_begin() {
    let Some(addr) = refresh_device().await else { return; };
    set_status("请选择图片文件");
    let picked = dialog::pick_file(
        &dialog::PickConfig { read: true, copy_to: None },
        &dialog::FilterConfig {
            multiple: false,
            extensions: vec!["jpg".into(), "jpeg".into(), "png".into(), "webp".into(), "gif".into()],
            default_directory: String::new(),
            default_file_name: String::new(),
        },
    ).into_future().await;
    if picked.name.trim().is_empty() || picked.data.is_empty() {
        set_status("未选择图片");
        return;
    }
    if picked.data.len() > MAX_IMAGE_BYTES {
        set_status("图片超过 2 MB，暂未传输");
        return;
    }
    let id = format!("gallery-{}", TRANSFER_SEQUENCE.fetch_add(1, Ordering::Relaxed));
    let total_chunks = (picked.data.len() + CHUNK_BYTES - 1) / CHUNK_BYTES;
    let transfer = PendingTransfer {
        id: id.clone(),
        name: picked.name.clone(),
        mime: mime_for_name(&picked.name).into(),
        data: picked.data,
        device_addr: addr.clone(),
        next_chunk: 0,
    };
    let header = json!({
        "tag": "gallery-begin",
        "id": id,
        "name": transfer.name,
        "mime": transfer.mime,
        "totalBytes": transfer.data.len(),
        "totalChunks": total_chunks
    });
    state().lock().unwrap_or_else(|poisoned| poisoned.into_inner()).pending = Some(transfer);
    match send_message(&addr, header).await {
        Ok(()) => set_status("等待手表确认接收…"),
        Err(()) => {
            state().lock().unwrap_or_else(|poisoned| poisoned.into_inner()).pending = None;
            set_status("无法向手表发送传输请求");
        }
    }
}

async fn send_next_chunk(transfer_id: &str) {
    let action = {
        let mut current = state().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(transfer) = current.pending.as_mut() else { return; };
        if transfer.id != transfer_id { return; }
        let total = (transfer.data.len() + CHUNK_BYTES - 1) / CHUNK_BYTES;
        if transfer.next_chunk >= total {
            Some((transfer.device_addr.clone(), json!({ "tag": "gallery-end", "id": transfer.id })))
        } else {
            let index = transfer.next_chunk;
            let start = index * CHUNK_BYTES;
            let end = std::cmp::min(start + CHUNK_BYTES, transfer.data.len());
            let encoded = STANDARD.encode(&transfer.data[start..end]);
            transfer.next_chunk += 1;
            Some((transfer.device_addr.clone(), json!({
                "tag": "gallery-chunk",
                "id": transfer.id,
                "index": index,
                "total": total,
                "data": encoded
            })))
        }
    };
    if let Some((addr, body)) = action {
        let percent = {
            let current = state().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            if let Some(transfer) = current.pending.as_ref() {
                let total = std::cmp::max(1, (transfer.data.len() + CHUNK_BYTES - 1) / CHUNK_BYTES);
                (transfer.next_chunk * 100) / total
            } else { 0 }
        };
        if send_message(&addr, body).await.is_err() {
            state().lock().unwrap_or_else(|poisoned| poisoned.into_inner()).pending = None;
            set_status("发送中断，请保持手表图库页面打开");
        } else {
            set_status(format!("正在传输… {}%", percent));
        }
    }
}

async fn handle_interconnect_event(raw: &str) {
    let envelope: Value = match serde_json::from_str(raw) { Ok(value) => value, Err(_) => return };
    let data = envelope.get("data").and_then(Value::as_str).unwrap_or("");
    let message: Value = match serde_json::from_str(data) { Ok(value) => value, Err(_) => return };
    let tag = message.get("tag").and_then(Value::as_str).unwrap_or("");
    let id = message.get("id").and_then(Value::as_str).unwrap_or("");
    match tag {
        "gallery-handshake" => {
            let addr = envelope.get("addr").and_then(Value::as_str).unwrap_or("");
            if !addr.is_empty() {
                let _ = register::register_interconnect_recv(addr, TARGET_PACKAGE).into_future().await;
                set_status("手表图库已准备接收图片");
            }
        }
        "gallery-ready" => send_next_chunk(id).await,
        "gallery-ack" => send_next_chunk(id).await,
        "gallery-complete" => {
            state().lock().unwrap_or_else(|poisoned| poisoned.into_inner()).pending = None;
            set_status("图片已传入手表图库");
        }
        "gallery-error" => {
            state().lock().unwrap_or_else(|poisoned| poisoned.into_inner()).pending = None;
            set_status("手表保存失败，已停止传输");
        }
        _ => {}
    }
}

struct GalleryTransferPlugin;

impl event::Guest for GalleryTransferPlugin {
    fn on_event(event_type: EventType, event_payload: String) -> FutureReader<String> {
        match event_type {
            EventType::InterconnectMessage => astrobox_ng_wit::block_on(handle_interconnect_event(&event_payload)),
            EventType::DeviceAction => { astrobox_ng_wit::spawn(async { let _ = refresh_device().await; }); }
            EventType::PluginMessage | EventType::ProviderAction | EventType::DeeplinkAction | EventType::TransportPacket | EventType::Timer => {}
        }
        immediate_string()
    }

    fn on_ui_event_v3(event_id: String, event_type: event::Event, _event_payload: String) -> FutureReader<String> {
        if event_type == ui::Event::Click && event_id == PICK_IMAGE_EVENT {
            astrobox_ng_wit::spawn(async { choose_and_begin().await; });
        }
        immediate_string()
    }

    fn on_ui_render(element_id: String) -> FutureReader<()> {
        render_main_ui(&element_id);
        immediate_unit()
    }

    fn on_card_render(_card_id: String) -> FutureReader<()> { immediate_unit() }
}

impl lifecycle::Guest for GalleryTransferPlugin {
    fn on_load() {
        logger::init();
        astrobox_ng_wit::spawn(async { let _ = refresh_device().await; });
    }
}

astrobox_ng_wit::export!(GalleryTransferPlugin);
