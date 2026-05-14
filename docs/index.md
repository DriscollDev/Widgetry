---
layout: default
title: Widgetry - Capstone Planning Wiki
description: Ten weeks of planning deliverables for the Widgetry capstone project.
---

<section class="home-hero">
  <p class="home-eyebrow">Capstone · Planning Phase</p>
  <img class="home-logo" src="{{ '/assets/img/logo-full.svg' | relative_url }}" alt="Widgetry" width="1484" height="1060">
  <p class="home-tagline">An API monitoring dashboard.</p>
  <p class="home-lede">
    Widgetry is an API monitoring dashboard: a web application where users compose
    grid-based boards of configurable widgets, each tied to an API or data source,
    viewable in a single browser tab. This wiki collects the ten planning-phase
    deliverables submitted across the capstone course.
  </p>
</section>

<section>
  <div class="section-heading">
    <h2>Weekly Deliverables</h2>
  </div>
  <div class="week-grid">
    {% for w in site.weeks %}
      <a class="week-tile" href="{{ '/weeks/' | append: w.slug | append: '/' | relative_url }}">
        <span class="week-tile-number">Week {{ w.number }}</span>
        <span class="week-tile-title">{{ w.title }}</span>
        <span class="week-tile-kind">
          {% case w.deliverable_kind %}
            {% when 'markdown' %}Document
            {% when 'image' %}Diagram
            {% when 'external' %}External link
            {% when 'embed' %}Interactive embed
            {% when 'slides' %}Slide deck
            {% when 'mermaid' %}Chart
            {% when 'self' %}This wiki
          {% endcase %}
        </span>
      </a>
    {% endfor %}
  </div>
</section>

<section>
  <div class="section-heading">
    <h2>Team</h2>
  </div>
  <ul class="team-list">
    {% for member in site.team %}<li>{{ member.name }}</li>{% endfor %}
  </ul>
</section>

<section>
  <div class="section-heading">
    <h2>Related</h2>
  </div>
  <p>
    Internal design documentation - feature spec, engineering doc, screen inventory,
    and the rest - lives in the team's separate
    <a href="{{ site.external_links | where: 'label', 'Design Wiki' | map: 'url' | first }}">design wiki</a>.
    The source repository for this site is available
    <a href="{{ site.external_links | where: 'label', 'GitHub Repo' | map: 'url' | first }}">on GitHub</a>.
  </p>
</section>
