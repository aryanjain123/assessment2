Q1: What are the two primary types of deep neural networks used in AlphaGo, and what is the specific function of each?

Gold Standard Answer: AlphaGo uses value networks to evaluate board positions and policy networks to select moves. These networks reduce the effective depth and breadth of the search tree.

Q2: Describe the three distinct stages of the machine learning pipeline used to train the neural networks.

Gold Standard Answer: Supervised Learning (SL) Policy Network: Trained directly from expert human moves to provide fast, efficient updates.
Reinforcement Learning (RL) Policy Network: Improves upon the SL network by optimizing the final outcome of games played through self-play.
Value Network: Trained to predict the winner of games played by the RL policy network against itself.

Q3: Why does AlphaGo utilize a "rollout policy" ($p_{\pi}$) distinct from the stronger policy networks?

Gold Standard Answer: The rollout policy is less accurate but significantly faster. It achieves an accuracy of 24.2% but takes just 2 $\mu$s to select an action, whereas the policy network takes 3 ms8. This allows for rapid sampling during rollouts.

Q4: What specific hardware specifications were used for the "Distributed" version of AlphaGo?

Gold Standard Answer: The distributed version of AlphaGo utilized 40 search threads, 1202 CPUs, and 176 GPUs.

Q5: According to the tournament evaluation, what was the specific winning rate of AlphaGo against other Go programs?

Gold Standard Answer: AlphaGo achieved a 99.8% winning rate against other Go programs, winning 494 out of 495 games.
