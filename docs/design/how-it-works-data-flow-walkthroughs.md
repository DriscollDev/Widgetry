---
title: Data Flow Walkthroughs
permalink: /design/how-it-works-data-flow-walkthroughs/
---

This page traces what actually happens behind the scenes during four common operations. Each one is illustrated with a flowchart. If you've never read a flowchart before, the convention is simple: each box is a step, arrows show the order, and diamonds are decision points where the path forks.

## When you create your account

```mermaid
flowchart TD
    Start([Start]) --> Submit[User submits sign-up form]
    Submit --> Validate{Form validates?}
    Validate -->|no| Errors[Show errors]:::err
    Validate -->|yes| Create[Create user, hash password]
    Create --> SendEmail[Send verification email]
    SendEmail --> SignIn[Sign in, show verify banner]
    SignIn --> Wait["User clicks email link<br/>(async - minutes to days)"]
    Wait --> TokenValid{Token valid?}
    TokenValid -->|no| Expired[Link expired]:::err
    TokenValid -->|yes| Verify[Set email_verified_at]
    Verify --> CreateBoard[User creates first board]
    CreateBoard --> Persist[Empty board appears]:::ok

    classDef ok fill:#EAF3DE,stroke:#3B6D11,color:#173404
    classDef err fill:#FCEBEB,stroke:#A32D2D,color:#501313
```

**What you're looking at:** The path from "I just typed in my email" to "I have an empty dashboard ready to use." The interesting wrinkle is that you can use the app *before* you click the verification link in your email - we just show a banner asking you to verify when you have a moment. Verification only becomes mandatory if you later need to reset a forgotten password.

## When you drag a widget around

```mermaid
flowchart TD
    Start([Start]) --> Drag[User drags or resizes widget]
    Drag --> Snap[Snap to nearest grid cell]
    Snap --> ClientCheck{"Would it overlap<br/>another widget?"}
    ClientCheck -->|yes| SnapBack[Snap back, flash indicator]:::err
    ClientCheck -->|no| Optimistic[Show new position immediately]
    Optimistic --> Patch["Send change to server<br/>(after a brief pause)"]
    Patch --> ServerCheck[Server re-checks for overlap]
    ServerCheck --> Accept{Server accepts?}
    Accept -->|no| Rollback[Revert to previous position]:::err
    Accept -->|yes| Confirm[Save and confirm]:::ok

    classDef ok fill:#EAF3DE,stroke:#3B6D11,color:#173404
    classDef err fill:#FCEBEB,stroke:#A32D2D,color:#501313
```

**What you're looking at:** What happens between you releasing a drag and the new position being permanently saved. There are two checks for overlap - once in your browser, then again on our server. The browser check is for speed (you get an instant "no, that doesn't fit" without having to wait). The server check is for correctness, in case something gets out of sync (for instance, if you have the same board open in two browser tabs and dragged something in the other tab a moment ago). The server is the source of truth; the browser is just a fast preview.

## When the worker fetches data

```mermaid
flowchart TD
    Start([Start]) --> Tick[Scheduler wakes up - every 60 seconds]
    Tick --> Query[Find widgets that are due to refresh]
    Query --> Enqueue[Add a job for each one]
    Enqueue --> Dequeue[Worker picks up a job]
    Dequeue --> Load[Load configuration, decrypt any saved keys]
    Load --> Fetch["Try to fetch the data<br/>(retry up to 3 times)"]
    Fetch --> Success{Worked?}
    Success -->|yes| WriteValue[Save the new value]:::ok
    Success -->|no| WriteError[Save an error]:::err
    WriteValue --> Update[Mark the widget as recently checked]
    WriteError --> Update
    Update --> End([End])

    classDef ok fill:#EAF3DE,stroke:#3B6D11,color:#173404
    classDef err fill:#FCEBEB,stroke:#A32D2D,color:#501313
```

**What you're looking at:** The basic rhythm of the worker. Every minute, it asks: which widgets are due for a refresh? It then fetches data for each of them. Notice that whether the fetch succeeds or fails, we mark the widget as "recently checked." That's important - without it, a widget that's failing would get re-tried over and over in a tight loop. By recording every attempt, even the failed ones, we ensure that a misbehaving data source gets the same polite spacing as a healthy one.

## When the worker fetches a custom widget

The custom widget is special because the URL comes from the user, so we have to be careful. Here's the same fetching process with all the extra safety checks shown:

```mermaid
flowchart TD
    Start([Start]) --> Dequeue[Worker picks up custom widget job]
    Dequeue --> Load[Load configuration, decrypt key if any]
    Load --> Scheme{Is this a normal web URL?}
    Scheme -->|no| BadScheme[Reject: unsupported]:::err
    Scheme -->|yes| Resolve[Look up actual address]
    Resolve --> Public{"Is the address<br/>safely public?"}
    Public -->|no| Blocked[Reject: private address]:::err
    Public -->|yes| Pin["Connect to the address we just verified<br/>(prevents bait-and-switch)"]
    Pin --> Fetch["Fetch - with strict limits<br/>(5 second timeout, 256 KB max)"]
    Fetch --> FetchOk{Did it work?}
    FetchOk -->|no| NetErr[Network or HTTP error]:::err
    FetchOk -->|yes| Parse[Try to parse the response]
    Parse --> ParseOk{Is it valid?}
    ParseOk -->|no| BadJson[Invalid response]:::err
    ParseOk -->|yes| Apply[Look up the requested value]
    Apply --> PathOk{Did we find it?}
    PathOk -->|no| PathMiss[Path not found]:::err
    PathOk -->|yes| WriteValue[Save the value]:::ok

    BadScheme --> WriteError[Save an error]
    Blocked --> WriteError
    NetErr --> WriteError
    BadJson --> WriteError
    PathMiss --> WriteError

    WriteValue --> Update[Mark widget as recently checked]
    WriteError --> Update
    Update --> End([End])

    classDef ok fill:#EAF3DE,stroke:#3B6D11,color:#173404
    classDef err fill:#FCEBEB,stroke:#A32D2D,color:#501313
```

**What you're looking at:** Every place this flowchart can fail (the red boxes) is a deliberate safety check. Some are about the URL being valid. Some are about the response being parseable. The two especially important ones - *Is the address safely public?* and *Connect to the address we just verified* - are the protection against the SSRF attacks we explained on the [Keeping Your Data Safe](/design/how-it-works-keeping-data-safe/) page.

Notice that no matter how a fetch goes - success or any of the various failure modes - the widget always ends up at "Mark widget as recently checked." This is the same point we made on the previous diagram: we want a failing widget to wait its full hour before being tried again, just like a healthy one. Without that, a broken widget would get re-fetched constantly.
