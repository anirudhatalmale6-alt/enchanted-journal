/* ------------------------------------------------------------------
   The Enchanted Journal — content
   ------------------------------------------------------------------
   Placeholder text only. Replace the `body` of each entry with the
   client's real journal text; everything else (layout, flip, particles,
   tabs, saving) adapts automatically to however many entries are here.

   Each page object:
     title   — the heading printed on the page (optional)
     date    — small line under the heading (optional)
     body    — the pre-written text, shown until the reader types
     prompt  — faint placeholder shown when the page is left empty
------------------------------------------------------------------- */

const JOURNAL = {
  cover: {
    title: 'The Enchanted Journal',
    subtitle: 'a keeping-place for wishes, small wonders and quiet days',
    owner: 'These pages belong to ____________'
  },

  pages: [
    {
      title: 'Once Upon a Page',
      date: 'The first evening',
      body: 'Every story begins with an ordinary hour that refuses to stay ordinary. Mine began with rain on the window and a candle that would not stop leaning toward the draught, as though it, too, were curious about what came next.\n\nWrite here as though no one will ever read it, and the page will keep it faithfully.'
    },
    {
      title: 'A Wish, Written Down',
      date: 'On the second day',
      body: 'They say a wish spoken aloud escapes, but a wish written down stays and grows roots. So here is mine, planted in ink and left to the care of the paper.\n\nWhat would you plant on this page, if you knew it would be kept?'
    },
    {
      title: 'The Garden at Dusk',
      date: 'Somewhere in the middle',
      body: 'The petals came down all at once this evening, the way snow does when it has finally made up its mind. I stood in it until my sleeves were pale with them and my heart was, for a moment, entirely quiet.'
    },
    {
      title: 'Stardust and Small Hours',
      date: 'Late, very late',
      body: 'There is a particular hour when the house sleeps and the light goes soft and golden at the edges, and everything you were afraid of at noon seems gentle and far away.\n\nI have been saving this hour for you.'
    },
    {
      title: 'A Letter Never Sent',
      date: 'The day after the rain',
      body: 'I wrote it three times and sent it none. Perhaps that is what a journal is for — a place for the letters we mean but never post, kept safe until we are brave enough, or until we no longer need to be.'
    },
    {
      title: 'What the Forest Said',
      date: 'An afternoon walk',
      body: 'The path did the deciding for me today. Every turning smelled of moss and warm bark, and the light came down in long green ribbons, and nothing at all needed to be solved.'
    },
    {
      title: 'Ordinary Magic',
      date: 'A Tuesday',
      body: 'Bread rising. A letter in a familiar hand. Somebody laughing two rooms away. The small, unremarkable enchantments that hold an entire life together while we are busy looking for larger ones.'
    },
    {
      title: 'Happily, and Onward',
      date: 'The last of these pages',
      body: 'The story does not end here — it only runs out of paper. Turn back to the beginning whenever you like; the pages are patient, and they have been keeping your words the whole time.'
    }
  ],

  ending: {
    title: 'The End',
    line: '… and yet, only for now.'
  }
};
