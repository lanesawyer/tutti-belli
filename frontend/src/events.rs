use leptos::prelude::*;
use serde::{Deserialize, Serialize};
use thiserror::Error;

// TODO: Use the struct from the backend
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Event {
    title: String,
    location: Option<String>,
    date: String,
    start_time: String,
    end_time: String,
    notes: Option<String>
}

async fn fetch_events() -> Result<Vec<Event>, Error> {
    // make the request
    let res = reqwasm::http::Request::get("/api/events")
    .send()
    .await?
    // convert it to JSON
    .json::<Vec<Event>>()
    .await?;
    Ok(res)
}

pub fn fetch_example() -> impl IntoView {
    let events = LocalResource::new(move || fetch_events());

    let fallback = move |errors: ArcRwSignal<Errors>| {
        let error_list = move || {
            errors.with(|errors| {
                errors
                    .iter()
                    .map(|(_, e)| view! { <li>{e.to_string()}</li> })
                    .collect::<Vec<_>>()
            })
        };

        view! {
            <div class="error">
                <h2>"Error"</h2>
                <ul>{error_list}</ul>
            </div>
        }
    };

    view! {
        <div>
            <Transition fallback=|| view! { <div>"Loading..."</div> }>
                <ErrorBoundary fallback>
                    <ul>
                        {move || Suspend::new(async move {
                            events.await
                                .map(|events| {
                                    events.iter()
                                        .map(|e| {
                                            view! {
                                                <li>
                                                    {e.title.clone()}
                                                    {e.location.clone().unwrap_or_default()}
                                                    {e.notes.clone().unwrap_or_default()}
                                                    {e.date.clone()}
                                                    {e.start_time.clone()}
                                                    {e.end_time.clone()}
                                                </li>
                                            }
                                        })
                                        .collect::<Vec<_>>()
                                })
                        })}

                    </ul>
                </ErrorBoundary>
            </Transition>
        </div>
    }
}
