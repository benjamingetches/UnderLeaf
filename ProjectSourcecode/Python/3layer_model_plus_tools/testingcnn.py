import tensorflow as tf
import matplotlib.pyplot as plt
# Load the .h5 model
model = tf.keras.models.load_model('3_layer_model.h5')

# Verify the model has been loaded
model.summary()

# Assuming you have new test data in `X_test` and corresponding labels `y_test`
predictions = model.predict(X_test)

# Example to check individual predictions:
import numpy as np


    # Visualize first 5 images with their predictions
for i in range(5):
    plt.imshow(X_test[i].reshape(32, 32), cmap='gray')
    predicted_label = np.argmax(predictions[i])
    actual_label = np.argmax(y_test[i])
    plt.title(f"Actual: {actual_label}, Predicted: {predicted_label}")
    plt.show()


# Assuming `new_data` contains new images to classify
predictions = model.predict(new_data)
