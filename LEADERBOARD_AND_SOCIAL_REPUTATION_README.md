# Leaderboard and Social Reputation

## Overview
Design a community leaderboard and enhanced user profiles, inspired by Polymarket Rankings. Gamification drives volume by showcasing top earners and their "Winning Streaks" in a competitive social environment.

## Figma Design
[https://www.figma.com/design/EiJvUrEhVI8RkrEB9BmB7L/StellarPoly-Leaderboard---Social-Reputation?node-id=0-1&t=ptqepKxwi6CMYtQu-1]()

## Features

### Rankings
- **Top Profit**: Tab displaying users with highest profit earnings
- **Highest Volume**: Tab showing users with most trading volume
- **Most Accurate**: Tab ranking users by prediction accuracy

### Profile View
- User "Badges" including:
  - Early Adopter
  - Oracle Council
  - Top 1% Predictor
- Enhanced profile display with achievements and statistics

### Social Connectivity
- "Follow" buttons for user interaction
- "Share My Rank" generator for social sharing

## Trust Metric
The Trust Metric visually represents a user's reliability as a predictor through a combination of:
- Prediction accuracy percentage (displayed as a badge or icon)
- Number of successful predictions vs total predictions
- Community endorsements/followers count
- Time-based reliability (consistent performance over time)

Trusted predictors are indicated by:
- A "Verified Predictor" badge (gold star icon)
- Accuracy percentage displayed prominently (>70% accuracy)
- Green trust indicator dot next to username
- Tooltip showing detailed trust score breakdown

## PR Acceptance Criteria
- [ ] INCLUDE FIGMA LINK TO YOUR DESIGN in the PR
- [ ] Design a "Private Mode" toggle for users to hide total XLM values
- [ ] Mini-README in PR: Document the "Trust Metric"—how we visually represent that a user is a "Trusted" predictor
- [ ] Visual Validation: Mandatory Screenshot of the "Top 10 Predictors" leaderboard