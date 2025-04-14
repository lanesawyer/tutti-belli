use events::fetch_example;
use leptos::prelude::*;

mod events;

fn main() {
    console_error_panic_hook::set_once();

    leptos::mount::mount_to_body(fetch_example)
}
