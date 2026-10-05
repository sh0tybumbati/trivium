// Starter questions for a fresh install. Replace or extend them from the Questions tab.
const mc = (category, question, options, answer, explanation) => ({
  category, type: 'multiple_choice', question, options, answer, explanation, imageUrl: '',
});
const writeIn = (category, question, answer, explanation) => ({
  category, type: 'write_in', question, options: [], answer, explanation, imageUrl: '',
});

export const SEED_QUESTIONS = [
  mc('Science', 'What is the chemical symbol for gold?', ['Au', 'Ag', 'Go', 'Gd'], 'Au', "'Au' comes from the Latin word aurum."),
  mc('Science', 'Which organelle is known as the powerhouse of the cell?', ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi apparatus'], 'Mitochondria', 'Mitochondria produce most of a cell\'s ATP.'),
  mc('Science', 'How many bones are in the adult human body?', ['186', '206', '226', '256'], '206', 'Babies are born with around 300, many of which fuse as they grow.'),
  mc('Science', 'Which gas do plants absorb from the air for photosynthesis?', ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], 'Carbon dioxide', 'Plants turn CO2 and water into sugar and oxygen.'),
  mc('Science', 'Which planet is closest to the Sun?', ['Venus', 'Mercury', 'Mars', 'Earth'], 'Mercury', 'Mercury orbits the Sun every 88 days.'),
  mc('Science', 'What is the hardest naturally occurring substance?', ['Quartz', 'Topaz', 'Diamond', 'Corundum'], 'Diamond', 'Diamond rates 10 on the Mohs scale.'),

  mc('Geography', 'Which country has the most time zones, counting overseas territories?', ['Russia', 'United States', 'China', 'France'], 'France', 'France spans 12 time zones thanks to its overseas territories.'),
  mc('Geography', 'What is the capital of Australia?', ['Sydney', 'Melbourne', 'Canberra', 'Perth'], 'Canberra', 'Canberra was purpose-built as a compromise between Sydney and Melbourne.'),
  mc('Geography', 'Which is the longest river in Africa?', ['Congo', 'Niger', 'Zambezi', 'Nile'], 'Nile', 'The Nile runs about 6,650 km.'),
  mc('Geography', 'What is the smallest country in the world by area?', ['Monaco', 'San Marino', 'Vatican City', 'Liechtenstein'], 'Vatican City', 'It covers roughly 0.44 square kilometres.'),
  mc('Geography', 'In which country is Mount Kilimanjaro?', ['Kenya', 'Tanzania', 'Uganda', 'Ethiopia'], 'Tanzania', 'It is Africa\'s highest peak at 5,895 m.'),
  mc('Geography', 'Which is the largest ocean on Earth?', ['Atlantic', 'Indian', 'Arctic', 'Pacific'], 'Pacific', 'The Pacific covers about a third of the planet\'s surface.'),

  mc('History', 'In which year did the Berlin Wall fall?', ['1987', '1989', '1991', '1993'], '1989', 'It fell on 9 November 1989.'),
  mc('History', 'In which year did the Titanic sink?', ['1905', '1912', '1918', '1923'], '1912', 'It struck an iceberg on the night of 14 April 1912.'),
  mc('History', 'Which civilization built Machu Picchu?', ['Aztec', 'Maya', 'Inca', 'Olmec'], 'Inca', 'It was built in the 15th century in the Andes.'),
  mc('History', 'In which year was the Magna Carta sealed?', ['1066', '1215', '1348', '1492'], '1215', 'King John agreed to it at Runnymede.'),
  mc('History', 'Who was the first person to walk on the Moon?', ['Buzz Aldrin', 'Yuri Gagarin', 'Neil Armstrong', 'Michael Collins'], 'Neil Armstrong', 'Apollo 11 landed on 20 July 1969.'),
  mc('History', 'Cleopatra VII belonged to which royal dynasty?', ['Ptolemaic', 'Ramesside', 'Achaemenid', 'Seleucid'], 'Ptolemaic', 'The Ptolemies were Macedonian Greeks who ruled Egypt for nearly 300 years.'),

  mc('Entertainment', 'Which film won Best Picture at the 2020 Academy Awards?', ['1917', 'Joker', 'Parasite', 'Ford v Ferrari'], 'Parasite', 'It was the first non-English-language film to win Best Picture.'),
  mc('Entertainment', 'What is the name of Harry Potter\'s owl?', ['Errol', 'Hedwig', 'Pigwidgeon', 'Crookshanks'], 'Hedwig', 'Hedwig was a gift from Hagrid.'),
  mc('Entertainment', 'Which band released the album Abbey Road?', ['The Rolling Stones', 'The Beatles', 'Pink Floyd', 'The Who'], 'The Beatles', 'It came out in 1969.'),
  mc('Entertainment', 'Who directed the 1993 film Jurassic Park?', ['James Cameron', 'George Lucas', 'Steven Spielberg', 'Ridley Scott'], 'Steven Spielberg', 'It was based on Michael Crichton\'s novel.'),
  mc('Entertainment', 'In the Super Mario series, what is the name of Mario\'s brother?', ['Wario', 'Luigi', 'Toad', 'Yoshi'], 'Luigi', 'Luigi debuted alongside Mario in 1983.'),
  mc('Entertainment', 'Who wrote the play Romeo and Juliet?', ['Christopher Marlowe', 'Charles Dickens', 'William Shakespeare', 'Oscar Wilde'], 'William Shakespeare', 'It was written around 1595.'),

  mc('Sports', 'How many players from one team are on a basketball court at a time?', ['4', '5', '6', '7'], '5', 'Point guard, shooting guard, small forward, power forward and centre.'),
  mc('Sports', 'How often are the Summer Olympic Games held?', ['Every year', 'Every 2 years', 'Every 4 years', 'Every 5 years'], 'Every 4 years', 'Each four-year cycle is called an Olympiad.'),
  mc('Sports', 'Which country won the 2018 FIFA World Cup?', ['Croatia', 'Brazil', 'Germany', 'France'], 'France', 'France beat Croatia 4-2 in the final.'),
  mc('Sports', 'How many points is a touchdown worth in American football?', ['3', '6', '7', '2'], '6', 'A conversion kick or play afterwards can add 1 or 2 more.'),
  mc('Sports', 'In tennis, what is a score of zero called?', ['Nil', 'Zero', 'Love', 'Duck'], 'Love', 'It is thought to come from the French l\'oeuf, "the egg".'),
  mc('Sports', 'Which sport uses a shuttlecock?', ['Squash', 'Badminton', 'Table tennis', 'Racquetball'], 'Badminton', 'A shuttlecock is traditionally made from goose feathers.'),

  mc('Food & Drink', 'Sushi originated in which country?', ['China', 'Korea', 'Japan', 'Thailand'], 'Japan', 'Its roots trace back to preserving fish in fermented rice.'),
  mc('Food & Drink', 'What is the main ingredient of guacamole?', ['Tomato', 'Avocado', 'Lime', 'Cucumber'], 'Avocado', 'The name comes from the Aztec word ahuacamolli.'),
  mc('Food & Drink', 'Which spice is the most expensive by weight?', ['Vanilla', 'Cardamom', 'Saffron', 'Cinnamon'], 'Saffron', 'Each crocus flower yields only three threads.'),
  mc('Food & Drink', 'Which pasta is shaped like grains of rice?', ['Orzo', 'Penne', 'Farfalle', 'Rigatoni'], 'Orzo', 'Orzo is Italian for "barley".'),
  mc('Food & Drink', 'Which fruit is dried to make raisins?', ['Plum', 'Fig', 'Grape', 'Cherry'], 'Grape', 'Dried plums are prunes.'),
  mc('Food & Drink', 'Tequila is made from which plant?', ['Cactus', 'Sugar cane', 'Blue agave', 'Corn'], 'Blue agave', 'Agave is not technically a cactus.'),

  writeIn('Geography', 'What is the capital city of Canada?', 'Ottawa', 'Ottawa sits on the border between Ontario and Quebec.'),
  writeIn('Science', 'Name the largest animal on Earth.', 'Blue whale', 'A blue whale can reach about 30 metres.'),
];
