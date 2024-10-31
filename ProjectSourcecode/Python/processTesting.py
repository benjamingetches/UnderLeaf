import cv2
import numpy as np
import matplotlib.pyplot as plt
from process_to_lines import preprocess_image, segment_lines, segment_characters, predict_line_characters


def plot_images(images, titles, main_title):
    n = len(images)
    fig, axes = plt.subplots(1, n, figsize=(5 * n, 5))
    fig.suptitle(main_title)

    if n == 1:
        axes = [axes]

    for ax, image, title in zip(axes, images, titles):
        if len(image.shape) == 2:
            ax.imshow(image, cmap='gray')
        else:
            ax.imshow(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        ax.set_title(title)
        ax.axis('off')

    plt.tight_layout()
    plt.show()


def test_image_processing(image_path):
    # Step 1: Load and preprocess the image
    binary_image = preprocess_image(image_path)
    plot_images([cv2.imread(image_path), binary_image],
                ['Original Image', 'Preprocessed Binary Image'],
                'Preprocessing')

    # Step 2: Segment into lines
    lines = segment_lines(binary_image)
    plot_images(lines, [f'Line {i + 1}' for i in range(len(lines))], 'Line Segmentation')

    # Step 3: Segment each line into characters and get predictions
    all_line_predictions = []  # Store predictions for all lines
    for i, line in enumerate(lines):
        characters = segment_characters(line)

        # Plot each segmented character
        plot_images(characters, [f'Char {j + 1}' for j in range(len(characters))], f'Characters in Line {i + 1}')

        # Get LaTeX predictions for the line
        line_predictions = predict_line_characters(characters, return_format="latex")
        print(f"Predicted LaTeX for Line {i + 1}:", line_predictions)
        all_line_predictions.append(line_predictions)

    # Combine predictions for all lines if needed
    print("Complete LaTeX Output:", " ".join([" ".join(map(str, line)) for line in all_line_predictions]))


if __name__ == "__main__":
    # Replace with the path to your test image
    test_image_path = "testimg2.jpg"
    test_image_processing(test_image_path)

