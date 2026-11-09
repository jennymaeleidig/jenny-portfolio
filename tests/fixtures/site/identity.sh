# The identity block the tests build against. Same shape as content/identity.sh,
# with example values so no test depends on the real content.
FULL_NAME="Example Name"
TAGLINE="Test Tagline"
LOCATION="Example City, EX"
PORTFOLIO=https://example.com
EMAIL=hello@example.com
GITHUB=https://example.com/github
LINKEDIN=https://example.com/linkedin
ITCH=https://example.com/itch

PRIMARY_LINKS=(
  "Email=mailto:$EMAIL"
  "GitHub=$GITHUB"
  "LinkedIn=$LINKEDIN"
  "itch.io=$ITCH"
)
