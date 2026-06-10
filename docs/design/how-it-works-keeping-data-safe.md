---
title: Keeping Your Data Safe
permalink: /design/how-it-works-keeping-data-safe/
---

Security isn't a feature you can bolt on at the end - it has to be designed in from the start. This page explains the three biggest security questions we faced and how we addressed each one.

We've written this for a general audience. The team's engineering document covers the same ground at a much lower level if you want the specifics.

## How we store passwords

When you sign up with an email and password, we never actually store your password. We store something called a *hash* of it.

A password hash is the result of running your password through a one-way mathematical function. The function is easy to run forward (turn your password into a hash) and effectively impossible to run backward (turn a hash back into your password). When you log in, we run your typed-in password through the same function and check whether the result matches what we have stored. If it does, you're in. If our database were ever stolen, the attacker would get the hashes - useless on their own.

We use a hashing algorithm called **argon2id**, which is the current recommended standard. It's deliberately slow and memory-intensive, which makes it expensive for an attacker to try guessing passwords even if they did get the hashes. We also reject passwords that are too short or that appear on lists of commonly-used passwords.

If you sign in with Google instead, we don't see your password at all - Google handles the login and tells us "yes, this is the right person."

## How we store your API keys

Some custom widgets need an API key - a secret token that proves to the data source that you're allowed to use it. You give us the key when you set up the widget, and we send it along whenever we fetch your data.

Storing these is harder than storing passwords, because we need to *use* the key, not just check it. We can't store a one-way hash; we need to be able to recover the actual key when it's time to fetch data.

We use a technique called **envelope encryption**. The name describes the approach: imagine a sealed envelope inside a sealed envelope.

Here's how it works:

1. When you save an API key, we generate a brand-new random key just for that one widget. We use this random key to scramble (encrypt) your API key. The scrambled result is meaningless without the random key.
2. We then take the random key itself and encrypt it using a *master key* that lives only on our servers, never in the database.
3. We store both the encrypted API key and the encrypted random key in the database. We don't store the master key alongside them.

If someone steals our database, they get a pile of encrypted blobs and no way to read them - the master key isn't there. To actually decrypt anything, an attacker would need both the database *and* access to our running servers, which is a much higher bar.

There's one more thing: we never give you the option to see your stored API key. You can replace it with a new one, or delete it, but you can't ask us to display it back. The user interface shows it as `•••••••• (saved)`. This is by design - if no part of our system can return it to you, no compromised version of our system can leak it either.

## Protecting the custom widget from being abused

This is the most subtle of the three issues, and the one we think is the most interesting.

The custom widget lets you give us a URL and tell us to fetch it. That's the whole feature. The problem: if we naively trust the URL, a malicious user could give us a URL that points somewhere dangerous.

Here's the specific concern. Most networks have private addresses that aren't reachable from the public internet - internal company servers, your home router's admin page, the address that cloud servers use to access their own configuration. If someone gave our server a URL pointing at one of those addresses, our server (which is *inside* a network) might be able to reach it even though the user couldn't from their own machine. The user could effectively use our server as a window into networks they shouldn't be able to see.

This kind of attack has a name - **server-side request forgery**, or SSRF - and it's been the cause of significant real-world security breaches. So we treat it seriously.

Our defense has several layers:

1. **We check what kind of address the URL refers to.** Before fetching anything, we look up the actual numerical network address the URL points to. If that address falls in any of the known "private" ranges, we refuse to fetch it.
2. **We pin the address we resolved.** A clever attacker could give us a URL that *looks* public the first time we check it, but secretly points to a private address by the time we actually fetch. We prevent this by remembering the address we approved and connecting to that exact address.
3. **We follow redirects carefully.** If a URL redirects us somewhere else, we re-run all the checks on the new destination. We also limit how many redirects we'll follow.
4. **We limit how much data we'll accept.** A response can be at most 256 kilobytes. A malicious source can't drown our server in data.
5. **We limit how long we'll wait.** Five seconds. A slow source can't tie up our worker indefinitely.

We've also written tests that try to abuse the custom widget in known-bad ways and verify that each attempt is rejected. These tests run automatically every time we change the code, so a future change can't accidentally remove the protections.

## The pattern across all three

You might notice a theme: in each case, we've tried to design the system so that even if one thing fails, the damage is limited.

- Password hashing means a database leak doesn't expose passwords.
- Envelope encryption means a database leak doesn't expose API keys.
- The SSRF protections mean a malicious URL doesn't expose internal networks.

This approach has a name in security circles - *defense in depth*. The idea is to assume each individual protection might fail and to make sure no single failure is catastrophic. For a student project, we don't expect attackers at the level that motivates this kind of design in industry; we did it anyway because handling user accounts and user secrets is a responsibility we wanted to take seriously, and because it's the kind of thinking we want to develop as future engineers.
