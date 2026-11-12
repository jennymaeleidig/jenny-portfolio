# The identity block. Every page reads this file, so changing an address here
# changes it everywhere it appears.
FULL_NAME="Jenny Mae Leidig"
SITE_NAME="Jenny Leidig"
TAGLINE="Software Engineer & Creative Technologist"
LOCATION="Richmond, VA"
PORTFOLIO=https://portfolio.jenny-page.online/
EMAIL=jennymaeleidig@gmail.com
GITHUB=https://github.com/jennymaeleidig
LINKEDIN=https://www.linkedin.com/in/jleidig/
ITCH=https://jennyl.itch.io/

# Each primary link is a title<TAB>url record, the same shape a project's
# links use (ADR-0002). The title is printed verbatim.
PRIMARY_LINKS=(
	"Email"$'\t'"mailto:$EMAIL"
	"GitHub"$'\t'"$GITHUB"
	"LinkedIn"$'\t'"$LINKEDIN"
	"itch.io"$'\t'"$ITCH"
)
