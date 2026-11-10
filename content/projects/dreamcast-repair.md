---
year: 2026
status: shipped
category: articles
tags:
  - dreamcast
  - hardware repair
  - retro
  - teardown
publication: https://pagedout.institute/webview.php?issue=8&page=67&article=Dreamcast+Repair+-+A+journey+of+a+thousand+parts.
---
# Dreamcast Repair

A Sega Dreamcast, cleaned and put back together, that no longer gives any video. One page in Paged Out! issue #8 about why, and what a 2mm difference in screw length does to a motherboard.

The Dreamcast is a machine I have admired for a long time — *Jet Set Radio*, *Sonic Adventure*, *Shenmue*, *Seaman*, and the ongoing work to get GTA3 running on it. I had repaired consoles before, so a deep clean sounded like an afternoon. It became a multi-week affair.

It powered on, the fan spun, and the screen stayed black. The cause was in the screws: the Dreamcast uses two different sets, and a 12mm black screw in a slot meant for a 10mm silver one drives straight through to the motherboard and destroys the trace carrying video from the GPU. The clearance granted by the RF shield is almost exactly the thickness that ruins it. Doing this is so common that the sample photographs on Wikipedia show a board with a destroyed trace.

The teardown is documented well; the reassembly less so. That's the trap, and it is why I ended up hunting a replacement board instead. The hardware revisions matter here: VA0 boards are rare, VA1 boards are common and fit the same shell, but the GD-ROM drive on a VA1 wants 3.3V where the VA0 wanted 5V, the fan connector differs, and the controller ports are pinned differently — so the ribbon cable from one will not work with the other. I found a VA1 board and drive, took the trade, and wrote down what I learned.

It went up on the lazy sundays blog in February 2025, and Paged Out! picked it up for issue #8 in February 2026 — one article per page, printed, and free to download.
